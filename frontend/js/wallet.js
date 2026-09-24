/**
 * SkillSwap Platform - REST API Client & Auth/JWT State Manager
 * Connects to Express + TrusoDB Data Engine with full JWT token injection
 */

class SkillSwapStore {
  constructor() {
    const origin = (typeof window !== 'undefined' && window.location) ? (window.location.origin || '') : '';
    this.apiBase = (origin.includes(':3000')) ? '/api' : 'http://localhost:3000/api';
    this.storageKey = 'skillswap_vignan_store_v2';
    this.tokenKey = 'skillswap_auth_token';
    this.token = localStorage.getItem(this.tokenKey) || localStorage.getItem('token') || localStorage.getItem('auth_token') || null;
    this.currentPersonaId = localStorage.getItem('skillswap_active_persona') || null;
    this.currentUser = null;
    this.personas = {};
    this.quizzes = [];
    this.sessions = [];
    this.transactions = [];
    this.notifications = [];
    this.chats = {};
  }

  getAuthHeaders(customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders
    };
    const activeToken = this.token || localStorage.getItem(this.tokenKey) || localStorage.getItem('token') || localStorage.getItem('auth_token');
    if (activeToken) {
      headers['Authorization'] = `Bearer ${activeToken}`;
    }
    if (this.currentPersonaId) {
      headers['x-user-id'] = this.currentPersonaId;
    }
    return headers;
  }

  async init() {
    try {
      this.token = localStorage.getItem(this.tokenKey) || localStorage.getItem('token') || localStorage.getItem('auth_token') || null;
      this.currentPersonaId = localStorage.getItem('skillswap_active_persona') || null;

      if (this.token) {
        const isValid = await this.fetchMe();
        if (isValid && this.currentUser) {
          this.currentPersonaId = this.currentUser.id;
          localStorage.setItem('skillswap_active_persona', this.currentUser.id);
          sessionStorage.setItem('skillswap_logged_in', 'true');
          localStorage.setItem('skillswap_logged_in', 'true');
        } else if (!isValid && this.token) {
          // Verify if token is a valid unexpired JWT before wiping
          try {
            const parts = this.token.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              if (payload && payload.exp && payload.exp * 1000 > Date.now()) {
                if (!this.currentUser && payload.id) {
                  this.currentPersonaId = payload.id;
                  sessionStorage.setItem('skillswap_logged_in', 'true');
                  localStorage.setItem('skillswap_logged_in', 'true');
                }
              } else {
                this.setToken(null);
                sessionStorage.removeItem('skillswap_logged_in');
                localStorage.removeItem('skillswap_logged_in');
              }
            }
          } catch (e) {
            // Keep existing session in offline/local mode
          }
        }
      }

      await Promise.all([
        this.fetchUsers(),
        this.fetchQuizzes(),
        this.fetchSessions(),
        this.fetchWallet(),
        this.fetchCertificates()
      ]);
    } catch (e) {
      console.warn('API fetch warning, using local state:', e);
    }
  }

  // ==========================================
  // Authentication & Session Management
  // ==========================================
  async register({ email, password, name, college, major, role, bio }) {
    const res = await fetch(`${this.apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, college, major, role, bio })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Registration failed');

    this.setToken(data.token);
    this.currentUser = data.user;
    this.currentPersonaId = data.user.id;
    this.personas[data.user.id] = {
      ...(this.personas[data.user.id] || {}),
      ...data.user
    };
    localStorage.setItem('skillswap_active_persona', data.user.id);
    sessionStorage.setItem('skillswap_logged_in', 'true');
    localStorage.setItem('skillswap_logged_in', 'true');
    await this.fetchUsers();
    await this.fetchWallet();
    await this.fetchSessions();
    return data;
  }

  async login(emailOrId, password) {
    const isEmail = emailOrId.includes('@');
    const payload = isEmail ? { email: emailOrId, password } : { userId: emailOrId, password };

    const res = await fetch(`${this.apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Login failed');

    this.setToken(data.token);
    this.currentUser = data.user;
    this.currentPersonaId = data.user.id;
    this.personas[data.user.id] = {
      ...(this.personas[data.user.id] || {}),
      ...data.user
    };
    localStorage.setItem('skillswap_active_persona', data.user.id);
    sessionStorage.setItem('skillswap_logged_in', 'true');
    localStorage.setItem('skillswap_logged_in', 'true');
    await this.fetchUsers();
    await this.fetchWallet();
    await this.fetchSessions();
    return data;
  }

  async autoLoginPersona(personaId) {
    try {
      const email = personaId.includes('@') ? personaId : (personaId === 'admin' ? 'skrao@vignan.ac.in' : `${personaId}@vignan.ac.in`);
      const res = await fetch(`${this.apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Password123', userId: personaId })
      });
      const data = await res.json();
      if (data.success && data.token) {
        this.setToken(data.token);
        this.currentUser = data.user;
        this.currentPersonaId = data.user.id;
        this.personas[data.user.id] = {
          ...(this.personas[data.user.id] || {}),
          ...data.user
        };
      }
    } catch (e) {
      console.warn('Auto-login persona note:', e.message);
    }
  }

  async fetchMe() {
    try {
      const res = await fetch(`${this.apiBase}/auth/me`, {
        headers: this.getAuthHeaders()
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.success && data.user) {
        this.currentUser = data.user;
        this.currentPersonaId = data.user.id;
        this.personas[data.user.id] = {
          ...(this.personas[data.user.id] || {}),
          ...data.user
        };
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Could not verify session:', e.message);
      return false;
    }
  }

  async fetchLoginHistory() {
    try {
      const res = await fetch(`${this.apiBase}/auth/login-history`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.logins) {
        return data.logins;
      }
    } catch (e) {
      console.warn('Could not fetch login history:', e.message);
    }
    return [];
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem(this.tokenKey, token);
      localStorage.setItem('token', token);
      localStorage.setItem('auth_token', token);
      localStorage.setItem('jwt', token);
    } else {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem('token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('jwt');
    }
  }

  logout() {
    this.setToken(null);
    this.currentUser = null;
    this.currentPersonaId = null;
    localStorage.removeItem('skillswap_active_persona');
    sessionStorage.removeItem('skillswap_logged_in');
    localStorage.removeItem('skillswap_logged_in');
  }

  isSessionActive() {
    const hasToken = Boolean(this.token || localStorage.getItem(this.tokenKey) || localStorage.getItem('token') || localStorage.getItem('auth_token'));
    const hasLoginFlag = sessionStorage.getItem('skillswap_logged_in') === 'true' || localStorage.getItem('skillswap_logged_in') === 'true';
    const hasPersona = Boolean(localStorage.getItem('skillswap_active_persona') || (this.currentUser && this.currentUser.id !== 'guest'));
    return Boolean(hasToken || hasLoginFlag || (hasPersona && (this.currentPersonaId && this.currentPersonaId !== 'guest')));
  }

  getCurrentPersona() {
    if (this.currentUser) {
      const personaObj = this.personas[this.currentUser.id] || {};
      const isAdm = this.currentUser.role === 'ADMIN' || this.currentUser.is_admin === 1 || personaObj.isAdmin || false;
      const full = {
        ...personaObj,
        ...this.currentUser,
        role: this.currentUser.role || (isAdm ? 'ADMIN' : 'STUDENT'),
        isAdmin: isAdm
      };
      full.id = this.currentUser.id || personaObj.id || this.currentPersonaId;
      full.name = this.currentUser.name || personaObj.name || 'User';
      full.email = this.currentUser.email || personaObj.email || (full.id + '@vignan.ac.in');
      full.major = this.currentUser.major || personaObj.major || 'Vignan Student';
      full.college = this.currentUser.college || personaObj.college || 'Vignan University';
      full.bio = this.currentUser.bio || personaObj.bio || `Student at ${full.college}`;
      full.credits = this.currentUser.credits !== undefined ? Number(this.currentUser.credits) : (Number(personaObj.credits) || 0);
      full.skillsOffered = this.currentUser.skillsOffered || this.currentUser.skills_offered || personaObj.skillsOffered || [];
      full.skillsWanted = this.currentUser.skillsWanted || this.currentUser.skills_wanted || personaObj.skillsWanted || [];
      full.certificates = this.currentUser.certificates || personaObj.certificates || [];
      full.badges = this.currentUser.badges || personaObj.badges || (typeof this.currentUser.badges_json === 'string' ? JSON.parse(this.currentUser.badges_json) : ['Vignan Member', full.role]);
      return full;
    }
    if (this.currentPersonaId && this.personas[this.currentPersonaId]) {
      const persona = this.personas[this.currentPersonaId];
      return { ...persona, role: persona.role || (persona.isAdmin ? 'ADMIN' : 'STUDENT') };
    }
    const allRegistered = Object.values(this.personas);
    if (allRegistered.length > 0) {
      const first = allRegistered[0];
      return { ...first, role: first.role || (first.isAdmin ? 'ADMIN' : 'STUDENT') };
    }
    return {
      id: 'guest',
      name: 'Guest User',
      email: '',
      major: 'Vignan Student',
      college: 'Vignan University',
      bio: 'Enthusiastic Student & Peer Learner',
      credits: 0,
      skillsOffered: [],
      skillsWanted: [],
      certificates: [],
      badges: ['Vignan Student'],
      role: 'STUDENT',
      isAdmin: false
    };
  }

  getUserRole() {
    const cur = this.getCurrentPersona();
    return cur?.role || (cur?.isAdmin ? 'ADMIN' : 'STUDENT');
  }

  isFacultyAdmin() {
    const role = this.getUserRole();
    return role === 'ADMIN' || role === 'FACULTY_ADMIN' || role === 'SUPER_ADMIN' || Boolean(this.getCurrentPersona()?.isAdmin);
  }

  async switchPersona(personaId) {
    this.currentPersonaId = personaId;
    localStorage.setItem('skillswap_active_persona', personaId);
    sessionStorage.setItem('skillswap_logged_in', 'true');
    await this.autoLoginPersona(personaId);
    await this.fetchUsers();
    await this.fetchWallet();
    await this.fetchSessions();
    return this.getCurrentPersona();
  }

  async updateUserProfile(userData) {
    const targetId = userData.id || this.currentPersonaId;
    const res = await fetch(`${this.apiBase}/users/${targetId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(userData)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to update user details in database');

    this.currentUser = data.user;
    if (this.personas[targetId]) {
      this.personas[targetId] = {
        ...this.personas[targetId],
        ...data.user,
        escrowLocked: data.user.escrow_locked,
        lifetimeEarned: data.user.lifetime_earned,
        lifetimeSpent: data.user.lifetime_spent,
        reviewsCount: data.user.reviews_count
      };
    }
    await this.fetchUsers();
    return data;
  }

  // ==========================================
  // Protected Resource API Calls
  // ==========================================
  async fetchUsers() {
    try {
      const res = await fetch(`${this.apiBase}/users`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        const nextPersonas = {};
        data.users.forEach(u => {
          nextPersonas[u.id] = {
            ...u,
            name: u.name || u.id,
            major: u.major || 'Vignan Student',
            college: u.college || 'Vignan University',
            bio: u.bio || 'Vignan University peer learning enthusiast.',
            skillsOffered: u.skillsOffered || u.skills_offered || [],
            skillsWanted: u.skillsWanted || u.skills_wanted || [],
            certificates: u.certificates || [],
            escrowLocked: u.escrow_locked || 0.0,
            lifetimeEarned: u.lifetime_earned || 0.0,
            lifetimeSpent: u.lifetime_spent || 0.0,
            reviewsCount: u.reviews_count || 0
          };
        });
        this.personas = nextPersonas;
      }
    } catch (e) {
      console.warn('Backend fetch users warning:', e);
    }
    if (this.currentUser && this.currentUser.id) {
      this.personas[this.currentUser.id] = {
        ...(this.personas[this.currentUser.id] || {}),
        ...this.currentUser
      };
    }
    return this.personas;
  }

  async fetchCertificates(userId) {
    try {
      const activeId = userId || this.currentPersonaId || this.currentUser?.id || 'sri';
      const res = await fetch(`${this.apiBase}/certificates?userId=${encodeURIComponent(activeId)}`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.certificates)) {
        if (this.currentUser) {
          this.currentUser.certificates = data.certificates;
        }
        if (this.personas[activeId]) {
          this.personas[activeId].certificates = data.certificates;
        } else {
          this.personas[activeId] = { certificates: data.certificates };
        }
        return data.certificates;
      }
    } catch (e) {
      console.warn('Backend fetch certificates warning:', e);
    }
    return [];
  }

  async getMatchesForCurrentPersona() {
    const current = this.getCurrentPersona();
    const otherPersonas = Object.values(this.personas).filter(p => p && p.id !== current?.id && !p.isAdmin && !p.is_admin);
    const results = [];

    otherPersonas.forEach(peer => {
      const canTeachMe = (peer.skillsOffered || []).filter(so =>
        (current?.skillsWanted || []).some(sw =>
          (so.name || '').toLowerCase().includes((sw.name || '').toLowerCase()) ||
          (sw.name || '').toLowerCase().includes((so.name || '').toLowerCase()) ||
          ((so.category && sw.category) && so.category.toLowerCase() === sw.category.toLowerCase())
        )
      );

      const canLearnFromMe = (peer.skillsWanted || []).filter(sw =>
        (current?.skillsOffered || []).some(so =>
          (so.name || '').toLowerCase().includes((sw.name || '').toLowerCase()) ||
          (sw.name || '').toLowerCase().includes((so.name || '').toLowerCase()) ||
          ((so.category && sw.category) && so.category.toLowerCase() === sw.category.toLowerCase())
        )
      );

      const isTwoWay = canTeachMe.length > 0 && canLearnFromMe.length > 0;
      let matchScore = isTwoWay ? 98 : canTeachMe.length > 0 ? 88 : 72;

      results.push({
        peer,
        isTwoWay,
        matchScore,
        canTeachMe,
        canLearnFromMe
      });
    });

    return results.sort((a, b) => b.matchScore - a.matchScore);
  }

  async fetchAssessmentSubjects() {
    try {
      const res = await fetch(`${this.apiBase}/quizzes/subjects`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.subjects) {
        return data.subjects;
      }
    } catch (e) {
      console.warn('Could not load assessment subjects from API', e);
    }
    return [];
  }

  async generateAssessment({ skillName, questionCount = 20, difficulty = 'Mixed', assessmentType = 'Complete Mentor Assessment' }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(`${this.apiBase}/quizzes/generate`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          skillName,
          questionCount,
          difficulty,
          assessmentType
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data && data.success && (data.assessment || data.quiz)) {
        const quizObj = data.assessment || data.quiz;
        if (quizObj && Array.isArray(quizObj.questions) && quizObj.questions.length > 0) {
          return quizObj;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('API quiz generation fetch note, using client synthesizer:', err);
    }
    return this.createFallbackDynamicQuiz(skillName, questionCount, difficulty, assessmentType);
  }

  createFallbackDynamicQuiz(skillName = 'Python Programming & DSA', questionCount = 20, difficulty = 'Mixed', assessmentType = 'Complete Mentor Assessment') {
    const norm = (skillName || 'Python Programming & DSA').trim();
    const count = Math.max(10, Math.min(50, Number(questionCount) || 20));
    const timeLimit = Math.max(10, Math.round(count * 0.75));
    const maxMarks = count * 3;
    const lower = norm.toLowerCase();

    // Multi-domain question pools
    const domainBanks = {
      java: [
        {
          question: "Which memory area in the JVM stores Class metadata, bytecodes, and method information?",
          code_snippet: "// JVM Memory Architecture",
          options: ["Metaspace (in native memory)", "Heap Space", "Thread Stack", "Program Counter Register"],
          correct_option_index: 0,
          explanation: "Since Java 8, Class metadata and static method definitions reside in native memory known as Metaspace.",
          difficulty: "Medium"
        },
        {
          question: "What is the key difference between `HashMap` and `ConcurrentHashMap` in Java?",
          code_snippet: "Map<String, Integer> map = new ConcurrentHashMap<>();",
          options: ["ConcurrentHashMap uses bucket/segment-level locking and CAS for thread safety without global table locking", "HashMap is synchronized by default", "ConcurrentHashMap allows duplicate keys", "HashMap is thread-safe across threads"],
          correct_option_index: 0,
          explanation: "ConcurrentHashMap achieves high concurrency by employing CAS operations and synchronized blocks per bucket node.",
          difficulty: "Hard"
        },
        {
          question: "In Spring Boot, which annotation registers a class as an auto-detected singleton service bean in the IoC container?",
          code_snippet: "@Service\npublic class PaymentProcessor {\n}",
          options: ["@Service / @Component", "@Entity", "@Transactional", "@Value"],
          correct_option_index: 0,
          explanation: "@Service is a stereotype specialization of @Component that designates business logic beans for Spring IoC container injection.",
          difficulty: "Easy"
        },
        {
          question: "What is the primary benefit of Java Records introduced in modern Java?",
          code_snippet: "public record StudentDto(String id, String name, double gpa) {}",
          options: ["Concise syntax for immutable data carriers with auto-generated constructor, getters, equals, and hashCode", "Allows multiple class inheritance", "Disables Garbage Collection", "Runs code on GPU"],
          correct_option_index: 0,
          explanation: "Records provide a compact syntax for declaring transparent, immutable data-holding classes with compiler-generated boilerplate.",
          difficulty: "Easy"
        },
        {
          question: "In Spring Framework, which injection method is officially recommended by the Spring team for mandatory dependencies?",
          code_snippet: "public class OrderService {\n    private final PaymentGateway gateway;\n    public OrderService(PaymentGateway gateway) {\n        this.gateway = gateway;\n    }\n}",
          options: ["Constructor Injection", "Field Injection with @Autowired", "Setter Injection", "Static Factory Injection"],
          correct_option_index: 0,
          explanation: "Constructor injection allows fields to be marked final, guarantees immutability, and makes unit testing easier without reflection.",
          difficulty: "Medium"
        },
        {
          question: "What does the `@Transactional` annotation in Spring achieve during database operations?",
          code_snippet: "@Transactional\npublic void transferFunds(Account from, Account to, BigDecimal amount) {\n    debit(from, amount);\n    credit(to, amount);\n}",
          options: ["Wraps method execution in a database transaction, automatically committing on success and rolling back on runtime exceptions", "Caches method return values in Redis", "Makes the method thread-safe using Java locks", "Converts SQL into NoSQL queries"],
          correct_option_index: 0,
          explanation: "@Transactional leverages Spring AOP to manage ACID transaction boundaries, rolling back on unchecked exceptions by default.",
          difficulty: "Medium"
        },
        {
          question: "Why should `PreparedStatement` be favored over raw `Statement` in Java JDBC?",
          code_snippet: "PreparedStatement stmt = conn.prepareStatement(\"SELECT * FROM users WHERE email = ?\");\nstmt.setString(1, email);",
          options: ["It pre-compiles SQL and parameterizes inputs, preventing SQL Injection vulnerabilities and improving query reuse", "It only works with Oracle databases", "It executes faster only because it skips database constraints", "It requires no database credentials"],
          correct_option_index: 0,
          explanation: "Prepared statements separate SQL syntax from untrusted user input via placeholders, neutralizing SQL injection vectors.",
          difficulty: "Easy"
        },
        {
          question: "What is the primary purpose of a database connection pool such as HikariCP in Java Full Stack apps?",
          code_snippet: "spring.datasource.hikari.maximum-pool-size=10",
          options: ["Reuses established physical database connections to eliminate expensive TCP/TLS handshake overhead per request", "Encrypts all SQL statements before execution", "Translates SQL into JSON for the frontend", "Automatically writes SQL unit tests"],
          correct_option_index: 0,
          explanation: "Establishing database connections is computationally expensive; HikariCP manages reusable connection pools to handle high request concurrency.",
          difficulty: "Medium"
        }
      ],
      react: [
        {
          question: "What is the purpose of React's Virtual DOM diffing algorithm (Reconciliation)?",
          code_snippet: "const element = <h1>Hello, World!</h1>;",
          options: ["Calculates the minimal number of mutations required to update the real DOM by comparing lightweight in-memory tree snapshots", "Directly compiles JavaScript to browser assembly", "Prevents all JavaScript errors from bubbling", "Re-renders the entire browser window on each state update"],
          correct_option_index: 0,
          explanation: "React compares the new Virtual DOM with the previous snapshot using an O(N) diffing algorithm, applying only minimal patch operations to the real DOM.",
          difficulty: "Medium"
        },
        {
          question: "In React hooks, what will happen if an empty dependency array `[]` is passed to `useEffect`?",
          code_snippet: "useEffect(() => {\n    fetchData();\n}, []);",
          options: ["The effect runs only once after the initial component mount", "The effect runs on every single render cycle", "The effect never executes", "An infinite loop is triggered"],
          correct_option_index: 0,
          explanation: "An empty dependency array indicates the effect depends on no state or props, causing it to run once on mount and clean up on unmount.",
          difficulty: "Easy"
        },
        {
          question: "Why should `key` props be stable and unique when rendering lists in React?",
          code_snippet: "items.map(item => <li key={item.id}>{item.name}</li>)",
          options: ["Keys help React identify which items have changed, been added, or removed during Reconciliation, preserving component state", "Keys are required by HTML5 standard specifications", "Keys style elements with unique CSS IDs", "Keys increase internet download speed"],
          correct_option_index: 0,
          explanation: "Stable keys allow React to match existing DOM nodes across renders instead of remounting and destroying component state.",
          difficulty: "Easy"
        },
        {
          question: "What is the primary difference between `useMemo` and `useCallback` in React?",
          code_snippet: "const memoizedVal = useMemo(() => computeValue(a), [a]);\nconst memoizedFn = useCallback(() => handleClick(a), [a]);",
          options: ["`useMemo` caches the calculated result of a function; `useCallback` caches the function instance itself", "`useMemo` caches functions; `useCallback` caches values", "They are identical aliases", "`useCallback` runs synchronously before DOM painting"],
          correct_option_index: 0,
          explanation: "`useMemo` returns a memoized value, while `useCallback` returns a memoized callback function reference to prevent child re-renders.",
          difficulty: "Medium"
        },
        {
          question: "What is 'prop drilling' and which React feature was designed primarily to mitigate it for global state?",
          code_snippet: "const UserContext = React.createContext();",
          options: ["Passing props down through multiple layers of intermediary components; mitigated by the Context API", "Writing CSS inside JSX files", "Making multiple HTTP requests in parallel", "Compiling TypeScript interfaces"],
          correct_option_index: 0,
          explanation: "The Context API provides a way to share values between components without explicitly passing props through every level of the component tree.",
          difficulty: "Easy"
        }
      ],
      sql: [
        {
          question: "What is the key difference between `WHERE` and `HAVING` clauses in SQL?",
          code_snippet: "SELECT dept, COUNT(*) FROM employees GROUP BY dept HAVING COUNT(*) > 5;",
          options: ["`WHERE` filters rows before aggregation; `HAVING` filters aggregated group records after `GROUP BY`", "`WHERE` can only be used with numbers; `HAVING` only with text", "`HAVING` is executed before `WHERE`", "They are identical aliases"],
          correct_option_index: 0,
          explanation: "`WHERE` filters individual rows prior to grouping, while `HAVING` filters grouped summaries calculated by aggregate functions.",
          difficulty: "Easy"
        },
        {
          question: "What does the ACID acronym stand for in relational database transactions?",
          code_snippet: "BEGIN TRANSACTION;\n-- queries\nCOMMIT;",
          options: ["Atomicity, Consistency, Isolation, Durability", "Automated, Concurrent, Indexed, Distributed", "Asynchronous, Cached, Immutable, Deterministic", "Array, Column, Index, Directory"],
          correct_option_index: 0,
          explanation: "ACID guarantees that database transactions are processed reliably: Atomicity, Consistency, Isolation, Durability.",
          difficulty: "Easy"
        },
        {
          question: "Which type of SQL JOIN returns all rows from the left table and matched rows from the right table?",
          code_snippet: "SELECT * FROM orders o LEFT JOIN customers c ON o.customer_id = c.id;",
          options: ["LEFT OUTER JOIN", "INNER JOIN", "CROSS JOIN", "RIGHT OUTER JOIN"],
          correct_option_index: 0,
          explanation: "A LEFT JOIN preserves every record from the left table regardless of whether a matching record exists in the right table.",
          difficulty: "Easy"
        }
      ],
      cloud: [
        {
          question: "What is the key architectural difference between a Docker Container and a Virtual Machine (VM)?",
          code_snippet: "docker run -d -p 8080:80 nginx",
          options: ["Containers share the host OS kernel and isolate at process level via namespaces and cgroups; VMs run full guest OS on a hypervisor", "Containers require dedicated hardware hypervisors", "VMs are always faster to boot than containers", "Containers cannot run Linux"],
          correct_option_index: 0,
          explanation: "Containers leverage OS-level virtualization to share the host kernel with lightweight process isolation, booting in milliseconds.",
          difficulty: "Easy"
        },
        {
          question: "In Kubernetes, which controller guarantees that a specified number of identical Pod replicas are running at all times?",
          code_snippet: "kind: Deployment\nspec:\n  replicas: 3",
          options: ["ReplicaSet / Deployment Controller", "Kubelet", "CoreDNS", "Etcd Leader"],
          correct_option_index: 0,
          explanation: "ReplicaSets maintain a stable set of replica Pods running at any given time according to the declarative manifest.",
          difficulty: "Medium"
        }
      ],
      ml: [
        {
          question: "Which technique is primarily used to prevent overfitting in deep neural network architectures?",
          code_snippet: "model.add(Dropout(0.3))\nmodel.add(BatchNormalization())",
          options: ["Dropout, L2 Regularization, and Early Stopping", "Increasing the number of epochs indefinitely", "Removing validation sets", "Maximizing parameter weights"],
          correct_option_index: 0,
          explanation: "Dropout randomly deactivates neurons during training to enforce distributed, robust feature representations without co-adaptation.",
          difficulty: "Easy"
        },
        {
          question: "In Machine Learning evaluation, what is the Harmonic Mean of Precision and Recall?",
          code_snippet: "F1 = 2 * (Precision * Recall) / (Precision + Recall)",
          options: ["F1-Score", "ROC-AUC", "Mean Absolute Error (MAE)", "R-squared"],
          correct_option_index: 0,
          explanation: "F1-Score calculates the harmonic mean of precision and recall, balancing false positives and false negatives on imbalanced datasets.",
          difficulty: "Easy"
        }
      ],
      python: [
        {
          question: "What is the output of `type(lambda x: x)` in Python?",
          code_snippet: "func = lambda x: x ** 2\nprint(type(func))",
          options: ["<class 'function'>", "<class 'lambda'>", "<class 'object'>", "<class 'method'>"],
          correct_option_index: 0,
          explanation: "In Python, lambda expressions create anonymous function objects of type 'function'.",
          difficulty: "Easy"
        },
        {
          question: "What is the average time complexity of searching an element in a Python dictionary?",
          code_snippet: "data = {'a': 1, 'b': 2}\nval = data.get('a')",
          options: ["O(1)", "O(N)", "O(log N)", "O(N^2)"],
          correct_option_index: 0,
          explanation: "Python dictionaries use hash tables, providing average O(1) lookup time complexity.",
          difficulty: "Easy"
        },
        {
          question: "How does Python resolve method calls in multiple inheritance hierarchies?",
          code_snippet: "class C(A, B):\n    pass\nprint(C.mro())",
          options: ["C3 Linearization (MRO)", "Depth-First Search (DFS)", "Breadth-First Search (BFS)", "Random Resolution"],
          correct_option_index: 0,
          explanation: "Python uses the C3 Linearization algorithm to compute the class Method Resolution Order (MRO).",
          difficulty: "Hard"
        },
        {
          question: "What is the primary difference between `is` and `==` in Python?",
          code_snippet: "a = [1, 2]\nb = [1, 2]\nprint(a == b, a is b)",
          options: ["`==` checks value equality; `is` checks reference identity (memory address)", "`is` checks value equality; `==` checks identity", "Both perform identical identity checks", "Neither performs object comparison"],
          correct_option_index: 0,
          explanation: "`==` tests equality of values, whereas `is` checks if both variables refer to the exact same object in memory.",
          difficulty: "Easy"
        }
      ]
    };

    // Determine domain
    let activePool = domainBanks.general;
    if (lower.includes('java full stack') || lower.includes('java') || lower.includes('spring') || lower.includes('hibernate')) {
      activePool = domainBanks.java;
    } else if (lower.includes('react') || lower.includes('frontend') || lower.includes('javascript') || lower.includes('web')) {
      activePool = domainBanks.react;
    } else if (lower.includes('sql') || lower.includes('database') || lower.includes('postgres') || lower.includes('mysql')) {
      activePool = domainBanks.sql;
    } else if (lower.includes('cloud') || lower.includes('devops') || lower.includes('docker') || lower.includes('kubernetes')) {
      activePool = domainBanks.cloud;
    } else if (lower.includes('ml') || lower.includes('machine learning') || lower.includes('data science') || lower.includes('ai')) {
      activePool = domainBanks.ml;
    } else if (lower.includes('python') || lower.includes('dsa') || lower.includes('django')) {
      activePool = domainBanks.python;
    }

    const questions = [];
    if (activePool && activePool.length > 0) {
      // Shuffle active pool for freshness
      const shuffled = [...activePool].sort(() => Math.random() - 0.5);
      for (let i = 0; i < count; i++) {
        const template = shuffled[i % shuffled.length];
        // Shuffle options so correct answer is randomized
        const correctText = template.options[template.correct_option_index];
        const shuffledOpts = [...template.options].sort(() => Math.random() - 0.5);
        const newCorrectIdx = shuffledOpts.indexOf(correctText);

        questions.push({
          id: `q_${i + 1}`,
          question: i >= shuffled.length ? `[Deep Dive ${Math.floor(i / shuffled.length) + 1}] ${template.question}` : template.question,
          code_snippet: template.code_snippet,
          options: shuffledOpts,
          correct_option_index: newCorrectIdx,
          explanation: template.explanation,
          difficulty: template.difficulty
        });
      }
    } else {
      // Synthesize pure domain questions tailored to arbitrary subject
      const principles = [
        "Core Architecture & Separation of Concerns",
        "Deterministic Resource Disposal & Memory Management",
        "Contextual Exception Handling & Diagnostic Logging",
        "Algorithmic Complexity & Scalable State Transitions",
        "Automated Test Assertions & Regression Testing",
        "Input Schema Validation & Injection Defense"
      ];
      for (let i = 0; i < count; i++) {
        const principle = principles[i % principles.length];
        const cycle = Math.floor(i / principles.length);
        const qText = `In ${norm}, how should ${principle} be implemented in enterprise production environments?`;
        const opts = [
          `Strict modular encapsulation with explicit contracts and boundary validations`,
          `Synchronous execution on a single unmonitored thread`,
          `Hardcoding variables directly inside business logic`,
          `Suppressing runtime errors with empty catch blocks`
        ].sort(() => Math.random() - 0.5);
        const correctIdx = opts.indexOf(`Strict modular encapsulation with explicit contracts and boundary validations`);

        questions.push({
          id: `q_${i + 1}`,
          question: cycle > 0 ? `[Scenario ${cycle + 1}] ${qText}` : qText,
          code_snippet: `// ${norm} Implementation Scope\nvoid executeModule() {\n    validateInputs();\n    processEntity();\n}`,
          options: opts,
          correct_option_index: correctIdx,
          explanation: `In ${norm}, adhering to decoupled modularity, input validation, and boundary contracts ensures system reliability.`,
          difficulty: i % 3 === 0 ? 'Hard' : (i % 2 === 0 ? 'Medium' : 'Easy')
        });
      }
    }

    return {
      id: `quiz_dyn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      skill_name: norm,
      title: `${norm} Mentor Qualification Exam`,
      category: 'Tech',
      assessment_type: assessmentType,
      difficulty: difficulty,
      passing_score: 70,
      pass_marks: Math.ceil(maxMarks * 0.7),
      distinction_marks: Math.ceil(maxMarks * 0.9),
      max_marks: maxMarks,
      time_limit_minutes: timeLimit,
      questionsCount: count,
      questions
    };
  }

  async fetchAssessmentHistory() {
    try {
      const res = await fetch(`${this.apiBase}/quizzes/my-attempts`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.attempts) {
        return data.attempts;
      }
    } catch (e) {
      console.warn('Could not load assessment history from API', e);
    }
    return [];
  }

  async fetchQuizzes() {
    try {
      const res = await fetch(`${this.apiBase}/quizzes`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        this.quizzes = data.quizzes;
      }
    } catch (e) {
      console.warn('Could not load quizzes from API', e);
    }
    return this.quizzes;
  }

  async fetchQuizDetails(skillName) {
    const res = await fetch(`${this.apiBase}/quizzes/${encodeURIComponent(skillName)}`, {
      headers: this.getAuthHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch quiz');
    return data.quiz;
  }

  async submitQuiz(quizId, answers, skillName = '') {
    const res = await fetch(`${this.apiBase}/quizzes/submit`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        userId: this.currentPersonaId,
        quizId,
        skillName,
        answers
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Submission failed');
    await this.fetchUsers();
    await this.fetchWallet();
    return data;
  }

  async fetchQuizAttempts(userId = this.currentPersonaId) {
    try {
      const res = await fetch(`${this.apiBase}/quizzes/attempts/${userId}`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.attempts) {
        return data.attempts;
      }
    } catch (e) {
      console.warn('Could not fetch quiz attempts from API', e);
    }
    return [];
  }

  async bookSession({ teacherId, skillName, hours, date, time, topic }) {
    const res = await fetch(`${this.apiBase}/sessions/book`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        learnerId: this.currentPersonaId,
        tutorId: teacherId,
        skillName,
        durationHours: hours,
        sessionDate: date,
        time,
        topic
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Booking failed');
    await this.fetchUsers();
    await this.fetchSessions();
    await this.fetchWallet();
    return data;
  }

  async completeSessionAndReleaseEscrow(sessionId, rating, comment, tags) {
    const res = await fetch(`${this.apiBase}/sessions/complete`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        sessionId,
        rating,
        comment,
        tags
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Completion failed');
    await this.fetchUsers();
    await this.fetchSessions();
    await this.fetchWallet();
    return data;
  }

  async createGroupCohort({ skillName, topic, hours, date, time, maxCapacity }) {
    const res = await fetch(`${this.apiBase}/sessions/create-cohort`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        skillName,
        topic,
        durationHours: hours,
        sessionDate: date,
        time,
        maxCapacity
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create group live masterclass');
    await this.fetchSessions();
    return data;
  }

  async enrollInCohort(sessionId) {
    const res = await fetch(`${this.apiBase}/sessions/enroll`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ sessionId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Enrollment failed');
    await this.fetchUsers();
    await this.fetchSessions();
    await this.fetchWallet();
    return data;
  }

  async fetchCohortAttendees(sessionId) {
    try {
      const res = await fetch(`${this.apiBase}/sessions/${sessionId}/attendees`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.attendees) {
        return data.attendees;
      }
    } catch (e) {
      console.warn('Could not fetch cohort attendees', e);
    }
    return [];
  }

  async finalizeMasterclassAttendance(sessionId) {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/finalize-attendance`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to finalize attendance');
    await this.fetchUsers();
    await this.fetchSessions();
    await this.fetchWallet();
    return data;
  }

  async acceptSession(sessionId) {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/accept`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const err = new Error(data.error || 'Failed to accept session request');
      err.status = res.status;
      throw err;
    }
    await this.fetchSessions();
    await this.fetchMySessions();
    return data;
  }

  async declineSession(sessionId, reason = '') {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/decline`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const err = new Error(data.error || 'Failed to decline session request');
      err.status = res.status;
      throw err;
    }
    await this.fetchSessions();
    await this.fetchMySessions();
    await this.fetchWallet();
    return data;
  }

  async finalizeSwapAttendance(sessionId, attendanceStatus = 'Attended') {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/finalize`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ attendanceStatus })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const err = new Error(data.error || 'Failed to finalize attendance');
      err.status = res.status;
      throw err;
    }
    await this.fetchSessions();
    await this.fetchMySessions();
    await this.fetchWallet();
    return data;
  }

  async reportSession(sessionId, { issue_type, description, priority = 'Medium' }) {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/report`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ issue_type, description, priority })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const err = new Error(data.error || 'Failed to submit report');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async completeCohortSession(sessionId, rating = 5, comment = '', tags = []) {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/complete-cohort`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ rating, comment, tags })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Cohort completion failed');
    await this.fetchUsers();
    await this.fetchSessions();
    await this.fetchWallet();
    return data;
  }

  async fetchLiveMeeting(sessionId) {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/live-meeting`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to authenticate or initialize live meeting');
    return data;
  }

  async endLiveMeeting(sessionId) {
    try {
      const res = await fetch(`${this.apiBase}/sessions/${sessionId}/end-meeting`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      return await res.json();
    } catch (e) {
      console.warn('Could not end live meeting:', e.message);
    }
  }

  async fetchSessions() {
    try {
      const res = await fetch(`${this.apiBase}/sessions`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.sessions) {
        this.sessions = data.sessions;
      }
    } catch (e) {
      console.warn('Could not fetch sessions from API', e);
    }
    return this.sessions;
  }

  async fetchMySessions() {
    try {
      const res = await fetch(`${this.apiBase}/sessions/my`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        this.categorizedSessions = data;
        this.sessions = data.all || this.sessions;
        return data;
      }
    } catch (e) {
      console.warn('Could not fetch categorized sessions from API', e);
    }
    return {
      all: this.sessions || [],
      upcoming: (this.sessions || []).filter(s => s.status !== 'Completed' && s.status !== 'Cancelled'),
      past: (this.sessions || []).filter(s => s.status === 'Completed'),
      masterclasses: (this.sessions || []).filter(s => s.session_type === 'GROUP_COHORT'),
      groups: (this.sessions || []).filter(s => s.session_type === 'GROUP_COHORT'),
      cancelled: (this.sessions || []).filter(s => s.status === 'Cancelled'),
      counts: { upcoming: 0, past: 0, masterclasses: 0, groups: 0, cancelled: 0 }
    };
  }

  async rescheduleSession(sessionId, newDate, newTime) {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/reschedule`, {
      method: 'PATCH',
      headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ newDate, newTime })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to reschedule session');
    }
    await this.fetchSessions();
    return data;
  }

  async cancelSession(sessionId, reason) {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/cancel`, {
      method: 'POST',
      headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, reason })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to cancel session');
    }
    await this.fetchSessions();
    return data;
  }

  async cancelCohortEnrollment(sessionId) {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}/enroll`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to cancel enrollment');
    }
    await this.fetchSessions();
    return data;
  }

  async getSessionDetails(sessionId) {
    const res = await fetch(`${this.apiBase}/sessions/${sessionId}`, {
      headers: this.getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch session details');
    }
    return data.session;
  }

  async fetchWallet() {
    try {
      const res = await fetch(`${this.apiBase}/wallet/balance`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.wallet) {
        const cur = this.getCurrentPersona();
        cur.credits = data.wallet.availableCredits;
        cur.escrowLocked = data.wallet.escrowLocked;
        cur.lifetimeEarned = data.wallet.lifetimeEarned;
        cur.lifetimeSpent = data.wallet.lifetimeSpent;
      }

      const txRes = await fetch(`${this.apiBase}/wallet/transactions`, {
        headers: this.getAuthHeaders()
      });
      const txData = await txRes.json();
      if (txData.success && txData.transactions) {
        this.transactions = txData.transactions;
        const cur = this.getCurrentPersona();
        cur.transactions = txData.transactions;
      }
    } catch (e) {
      console.warn('Could not fetch wallet from API', e);
      const cur = this.getCurrentPersona();
      if (cur && cur.transactions) {
        this.transactions = cur.transactions;
      }
    }
  }

  async fetchTransactionsByUser(userId) {
    try {
      const res = await fetch(`${this.apiBase}/transactions/${userId}`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.transactions) {
        if (this.personas[userId]) {
          this.personas[userId].transactions = data.transactions;
        }
        return data.transactions;
      }
    } catch (e) {
      console.warn(`Could not fetch transactions for user ${userId}`, e);
    }

    if (this.personas[userId] && this.personas[userId].transactions) {
      return this.personas[userId].transactions;
    }
    return (this.transactions || []).filter(tx => tx.user_id === userId);
  }

  async fetchChatMessages(peerId) {
    try {
      const res = await fetch(`${this.apiBase}/chats/messages?peerId=${peerId}`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.messages) {
        return data.messages;
      }
    } catch (e) {
      console.warn('Could not fetch chat messages', e);
    }
    return [];
  }

  async sendMessage(receiverId, text) {
    const res = await fetch(`${this.apiBase}/chats/send`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        receiverId,
        messageType: 'text',
        text
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to send message');
    return data;
  }

  async uploadVoiceAudio(blob, duration) {
    let ext = 'webm';
    if (blob && blob.type) {
      if (blob.type.includes('mp4')) ext = 'mp4';
      else if (blob.type.includes('ogg')) ext = 'ogg';
      else if (blob.type.includes('wav')) ext = 'wav';
    }
    const formData = new FormData();
    formData.append('audio', blob, `voice-${Date.now()}.${ext}`);
    formData.append('duration', duration || 0);

    const token = this.authToken || localStorage.getItem('skillswap_auth_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${this.apiBase}/chats/upload-voice`, {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to upload voice audio');
    }
    return data;
  }

  async sendVoiceMessage(receiverId, audioUrl, audioDuration, waveform = null) {
    const res = await fetch(`${this.apiBase}/chats/send`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        receiverId,
        messageType: 'voice',
        text: '🎤 Voice message',
        audioUrl,
        audioData: audioUrl,
        audioDuration,
        audioWaveform: waveform,
        waveform: waveform
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to send voice message');
    return data;
  }

  async markChatAsRead(peerId) {
    try {
      const res = await fetch(`${this.apiBase}/chats/read`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ peerId })
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  }

  async markChatAsDelivered(peerId) {
    try {
      const res = await fetch(`${this.apiBase}/chats/deliver`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ peerId })
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  }

  async fetchConversations() {
    try {
      const res = await fetch(`${this.apiBase}/chats/conversations`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.conversations) {
        return data.conversations;
      }
    } catch (e) {
      console.warn('Could not fetch conversations', e);
    }
    return [];
  }

  async addSkillOffered(skill) {
    const res = await fetch(`${this.apiBase}/skills/offered`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        userId: this.currentPersonaId,
        ...skill
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to add skill');
    // Non-blocking background cache refresh
    Promise.all([this.fetchUsers(), this.fetchWallet()]).catch(() => {});
    return data;
  }

  async addSkillWanted(skill) {
    const res = await fetch(`${this.apiBase}/skills/wanted`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        userId: this.currentPersonaId,
        ...skill
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to add skill');
    this.fetchUsers().catch(() => {});
    return data;
  }

  async uploadCertificate(certData) {
    const res = await fetch(`${this.apiBase}/certificates/upload`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        userId: this.currentPersonaId,
        ...certData
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Certificate upload failed');
    await this.fetchUsers();
    await this.fetchWallet();
    return data;
  }

  async transferCredits(recipientId, amount, note = '') {
    const res = await fetch(`${this.apiBase}/wallet/transfer`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        recipientId,
        amount: Number(amount),
        note
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Transfer failed');
    await this.fetchUsers();
    await this.fetchWallet();
    return data;
  }

  // ==========================================
  // Support Team & Shared Doubt Classification Methods
  // ==========================================
  async fetchSupportStats() {
    try {
      const res = await fetch(`${this.apiBase}/support/stats`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.stats) {
        return data.stats;
      }
    } catch (e) {
      console.warn('Could not fetch support stats:', e.message);
    }
    return { openDoubts: 0, inProgressDoubts: 0, resolvedDoubts: 0, totalRewardsCredits: 0 };
  }

  async fetchSupportSubjects() {
    try {
      const res = await fetch(`${this.apiBase}/support/subjects`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.subjects)) {
        return data.subjects;
      }
    } catch (e) {
      console.warn('Could not fetch support subjects:', e.message);
    }
    return [
      'Python Programming & DSA',
      'UI/UX Design & Figma',
      'React.js Frontend & State Architecture',
      'Database Systems & Composite Indexing',
      'Machine Learning & Deep Learning',
      'Cyber Security & Ethical Hacking'
    ];
  }

  async fetchSupportDoubts(filter = {}) {
    try {
      const query = new URLSearchParams(filter).toString();
      const res = await fetch(`${this.apiBase}/support/doubts?${query}`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && (data.doubts || data.tickets)) {
        return data.doubts || data.tickets;
      }
    } catch (e) {
      console.warn('Could not fetch support doubts:', e.message);
    }
    return [];
  }

  async fetchSupportTickets(filter = {}) {
    return this.fetchSupportDoubts(filter);
  }

  async checkSupportEligibility(skillName) {
    const res = await fetch(`${this.apiBase}/support/eligibility?skillName=${encodeURIComponent(skillName || '')}`, {
      headers: this.getAuthHeaders()
    });
    return await res.json();
  }

  async createSupportDoubt({ category, course, skillName, title, description, codeSnippet, issueType, sessionId, attachments, attachmentName, attachmentData }) {
    const res = await fetch(`${this.apiBase}/support/doubts`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        category: category || skillName,
        course: course || skillName,
        skillName,
        title,
        description,
        codeSnippet,
        issueType,
        sessionId,
        attachments: attachments || [],
        attachmentName,
        attachmentData
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Could not create support doubt');
    return data;
  }

  async createSupportTicket(data) {
    return this.createSupportDoubt(data);
  }

  async acceptSupportDoubt(doubtId) {
    const res = await fetch(`${this.apiBase}/support/doubts/${doubtId}/accept`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    const data = await res.json();
    if (res.status === 409 || !data.success) {
      const err = new Error(data.error || 'This doubt has already been accepted by another user.');
      err.status = res.status;
      err.isConflict = (res.status === 409);
      throw err;
    }
    return data;
  }

  async claimSupportTicket(ticketId) {
    return this.acceptSupportDoubt(ticketId);
  }

  async submitDoubtAnswer(doubtId, { answerText, solution, classification, attachments, attachmentName, attachmentData, recommendedAssessmentSkill, recommendedQuizSkill }) {
    const res = await fetch(`${this.apiBase}/support/doubts/${doubtId}/answer`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        answerText: answerText || solution,
        solution,
        classification,
        attachments: attachments || [],
        attachmentName,
        attachmentData,
        recommendedAssessmentSkill,
        recommendedQuizSkill
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Could not submit solution');
    await this.fetchWallet();
    return data;
  }

  async resolveSupportTicket(ticketId, data) {
    return this.submitDoubtAnswer(ticketId, data);
  }

  async downloadAttachment(attId, fileName = 'download') {
    try {
      const token = this.token || localStorage.getItem('skillswap_token') || sessionStorage.getItem('skillswap_token');
      const res = await fetch(`${this.apiBase}/support/attachments/${attId}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (e) {
      console.error('Download error:', e);
      throw e;
    }
  }

  async rateSupportDoubt(doubtId, rating, feedback) {
    const res = await fetch(`${this.apiBase}/support/doubts/${doubtId}/rate`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ rating, feedback })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Could not rate support mentor');
    return data;
  }

  async rateSupportTicket(ticketId, rating, feedback) {
    return this.rateSupportDoubt(ticketId, rating, feedback);
  }

  // ==========================================
  // Centralized Notifications & Sidebar Badges
  // ==========================================
  async fetchSidebarCounts() {
    try {
      const res = await fetch(`${this.apiBase}/notifications/sidebar-counts`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.counts) {
        this.sidebarCounts = data.counts;
        return data.counts;
      }
    } catch (e) {
      console.warn('Could not fetch sidebar counts:', e);
    }
    return this.sidebarCounts || {
      messages: 0,
      bookSwap: 0,
      mySessions: 0,
      support: 0,
      certificates: 0,
      assessments: 0,
      liveRoom: 0
    };
  }

  async fetchNotifications() {
    try {
      const res = await fetch(`${this.apiBase}/notifications`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) {
        this.notifications = data.notifications;
        return data.notifications;
      }
    } catch (e) {
      console.warn('Could not fetch notifications:', e);
    }
    return this.notifications || [];
  }

  async markAllNotificationsRead() {
    try {
      const res = await fetch(`${this.apiBase}/notifications/mark-read`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        (this.notifications || []).forEach(n => { n.is_unread = 0; n.unread = false; });
      }
      return data;
    } catch (e) {
      console.warn('Could not mark all notifications as read:', e);
      return { success: false };
    }
  }

  async markNotificationRead(id) {
    try {
      const res = await fetch(`${this.apiBase}/notifications/${id}/mark-read`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        const item = (this.notifications || []).find(n => n.id === id);
        if (item) { item.is_unread = 0; item.unread = false; }
      }
      return data;
    } catch (e) {
      console.warn('Could not mark notification as read:', e);
      return { success: false };
    }
  }
}

window.store = new SkillSwapStore();
