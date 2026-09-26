/**
 * Code Lab - Interactive LMS Practice & Problem Solving Environment
 * Supports Multi-Step Workflow (Subject -> Difficulty -> Problems -> IDE)
 */

class CodeLabModule {
  constructor() {
    this.currentStep = 1; // 1: Subject, 2: Difficulty, 3: Problems, 4: IDE
    this.selectedSubject = 'Data Structures & Algorithms';
    this.selectedDifficulty = 'Intermediate';
    this.problemFilter = 'ALL'; // 'ALL', 'CODING', 'CONCEPTUAL', 'MIXED'
    this.sortBy = 'recommended';
    this.searchQuery = '';
    this.solvedCount = 24;
    this.currentProblemId = 'two-sum';
    this.selectedLanguage = 'python3';
    this.activeIdeTab = 'description';
    this.activeRightTab = 'testcases';
    this.activeTestCaseIndex = 0;

    // Submitted / Solved Problems Tracking
    this.submittedProblemIds = new Set();

    // Timer State
    this.timerSeconds = 0;
    this.timerRunning = false;
    this.timerInterval = null;

    // Subjects List (12 Subjects from Screenshot)
    this.subjects = [
      { id: 'dsa', name: 'Data Structures & Algorithms', problems: '450+ Problems', icon: '{}', iconType: 'text', bg: '#eff6ff', color: '#2563eb' },
      { id: 'python', name: 'Python', problems: '320+ Problems', icon: 'fa-brands fa-python', iconType: 'fa', bg: '#fefce8', color: '#eab308' },
      { id: 'cpp', name: 'C++', problems: '280+ Problems', icon: 'fa-solid fa-code', iconType: 'fa', bg: '#f0fdf4', color: '#16a34a' },
      { id: 'java', name: 'Java', problems: '300+ Problems', icon: 'fa-brands fa-java', iconType: 'fa', bg: '#fff7ed', color: '#ea580c' },
      { id: 'js', name: 'JavaScript', problems: '250+ Problems', icon: 'fa-brands fa-js', iconType: 'fa', bg: '#fef08a', color: '#ca8a04' },
      { id: 'web', name: 'Web Development', problems: '200+ Problems', icon: 'fa-solid fa-globe', iconType: 'fa', bg: '#f0f9ff', color: '#0284c7' },
      { id: 'dbms', name: 'Database Management', problems: '180+ Problems', icon: 'fa-solid fa-database', iconType: 'fa', bg: '#ecfdf5', color: '#059669' },
      { id: 'os', name: 'Operating Systems', problems: '150+ Problems', icon: 'fa-solid fa-microchip', iconType: 'fa', bg: '#faf5ff', color: '#9333ea' },
      { id: 'cn', name: 'Computer Networks', problems: '140+ Problems', icon: 'fa-solid fa-network-wired', iconType: 'fa', bg: '#eff6ff', color: '#3b82f6' },
      { id: 'oop', name: 'Object Oriented Programming', problems: '200+ Problems', icon: 'fa-solid fa-cube', iconType: 'fa', bg: '#f5f3ff', color: '#7c3aed' },
      { id: 'aptitude', name: 'Aptitude & Logical Reasoning', problems: '300+ Problems', icon: 'fa-solid fa-brain', iconType: 'fa', bg: '#fdf2f8', color: '#db2777' },
      { id: 'sysdesign', name: 'System Design', problems: '120+ Problems', icon: 'fa-solid fa-server', iconType: 'fa', bg: '#e0e7ff', color: '#4f46e5' }
    ];

    // Difficulty Levels
    this.difficulties = [
      {
        id: 'beginner',
        name: 'Beginner',
        tagline: 'Start your coding journey',
        desc: 'Perfect for learning the basics and building a strong foundation.',
        icon: 'fa-solid fa-seedling',
        iconBg: 'rgba(16, 185, 129, 0.1)',
        iconColor: '#10b981',
        features: ['Basic concepts', 'Step-by-step guidance', 'Beginner-friendly problems', 'Build confidence'],
        problems: '450+ Problems',
        estTime: '5–15 mins each'
      },
      {
        id: 'intermediate',
        name: 'Intermediate',
        tagline: 'Strengthen your skills',
        desc: 'More challenging problems to improve your problem-solving abilities.',
        icon: 'fa-solid fa-chart-simple',
        iconBg: 'rgba(37, 99, 235, 0.1)',
        iconColor: '#2563eb',
        features: ['Real-world concepts', 'Moderate difficulty problems', 'Test your understanding', 'Improve logical thinking'],
        problems: '300+ Problems',
        estTime: '15–30 mins each'
      },
      {
        id: 'advanced',
        name: 'Advanced',
        tagline: 'Challenge yourself',
        desc: 'Tackle complex problems and prepare for technical interviews.',
        icon: 'fa-solid fa-trophy',
        iconBg: 'rgba(239, 68, 68, 0.1)',
        iconColor: '#ef4444',
        features: ['Advanced algorithms', 'Complex problem solving', 'Interview-level questions', 'Sharpen your skills'],
        problems: '200+ Problems',
        estTime: '30+ mins each'
      }
    ];

    // Problems Dataset
    this.problems = [
      {
        id: 'two-sum',
        num: 1,
        title: 'Two Sum',
        difficulty: 'Easy',
        type: 'Coding',
        tags: ['Coding', 'Arrays', 'Hash Map'],
        solvedCount: '12.4K solved',
        timeEstimate: '10–15 mins',
        description: `Given an array of integers <code>nums</code> and an integer <code>target</code>, return indices of the two numbers such that they add up to <code>target</code>.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

You can return the answer in any order.`,
        examples: [
          {
            input: 'nums = [2, 7, 11, 15], target = 9',
            output: '[0, 1]',
            explanation: 'Because nums[0] + nums[1] == 2 + 7 == 9, we return [0, 1].'
          },
          {
            input: 'nums = [3, 2, 4], target = 6',
            output: '[1, 2]',
            explanation: 'Because nums[1] + nums[2] == 2 + 4 == 6, we return [1, 2].'
          },
          {
            input: 'nums = [3, 3], target = 6',
            output: '[0, 1]',
            explanation: 'Because nums[0] + nums[1] == 3 + 3 == 6, we return [0, 1].'
          }
        ],
        constraints: [
          '2 <= nums.length <= 10^4',
          '-10^9 <= nums[i] <= 10^9',
          '-10^9 <= target <= 10^9',
          'Only one valid answer exists.'
        ],
        hints: [
          'A really brute force way would be to search for all possible pairs of numbers but that would be slow (O(N^2)).',
          'Can we use extra space? We can use a Hash Map to look up the complement in O(1) time.'
        ],
        referenceSolution: {
          python3: `class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        seen = {}\n        for i, n in enumerate(nums):\n            diff = target - n\n            if diff in seen:\n                return [seen[diff], i]\n            seen[n] = i\n        return []`
        },
        starterCode: { python3: '', javascript: '', java: '', cpp: '' },
        testCases: [
          { input: 'nums = [2, 7, 11, 15]\ntarget = 9', expected: '[0, 1]' },
          { input: 'nums = [3, 2, 4]\ntarget = 6', expected: '[1, 2]' },
          { input: 'nums = [3, 3]\ntarget = 6', expected: '[0, 1]' }
        ]
      },
      {
        id: 'reverse-a-string',
        num: 2,
        title: 'Reverse a String',
        difficulty: 'Easy',
        type: 'Coding',
        tags: ['Coding', 'Strings', 'Basics'],
        solvedCount: '10.1K solved',
        timeEstimate: '5–10 mins',
        description: `Write a program to reverse a given string in-place.

The input string is given as an array of characters <code>s</code>.

You must do this by modifying the input array in-place with <code>O(1)</code> extra memory.`,
        examples: [
          {
            input: 's = ["h","e","l","l","o"]',
            output: '["o","l","l","e","h"]',
            explanation: 'The characters are inverted from start to end.'
          },
          {
            input: 's = ["H","a","n","n","a","h"]',
            output: '["h","a","n","n","a","H"]',
            explanation: 'Palindrome-style character swapping.'
          }
        ],
        constraints: [
          '1 <= s.length <= 10^5',
          's[i] is a printable ascii character.'
        ],
        hints: [
          'The entire logic is based on using two pointers: one at the start, one at the end.'
        ],
        referenceSolution: {
          python3: `class Solution:\n    def reverseString(self, s: list[str]) -> None:\n        left, right = 0, len(s) - 1\n        while left < right:\n            s[left], s[right] = s[right], s[left]\n            left += 1\n            right -= 1`
        },
        starterCode: { python3: '', javascript: '', java: '', cpp: '' },
        testCases: [
          { input: 's = ["h","e","l","l","o"]', expected: '["o","l","l","e","h"]' },
          { input: 's = ["H","a","n","n","a","h"]', expected: '["h","a","n","n","a","H"]' }
        ]
      },
      {
        id: 'what-is-a-stack',
        num: 3,
        title: 'What is a Stack?',
        difficulty: 'Easy',
        type: 'Conceptual',
        tags: ['Conceptual', 'Data Structures', 'Theory'],
        solvedCount: '8.7K solved',
        timeEstimate: '2–5 mins',
        description: `Which data structure follows the <strong>LIFO (Last In First Out)</strong> principle?

Analyze stack operations, real-world examples (call stack, undo operations, browser history back/forward), and asymptotic time complexities.`,
        examples: [
          {
            input: 'Operations: push(10), push(20), pop()',
            output: '20',
            explanation: 'The element inserted last (20) is removed first.'
          }
        ],
        constraints: [
          'Stack operations: push, pop, peek, isEmpty',
          'Expected operational time complexity: O(1)'
        ],
        hints: [
          'Think of a stack of plates in a cafeteria: the plate placed last is taken first.'
        ],
        referenceSolution: {
          python3: `class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item):\n        self.items.append(item)\n    def pop(self):\n        return self.items.pop() if self.items else None`
        },
        starterCode: { python3: '', javascript: '', java: '', cpp: '' },
        testCases: [
          { input: 'stack = Stack()\nstack.push(10)\nstack.push(20)\nstack.pop()', expected: '20' }
        ]
      },
      {
        id: 'valid-parentheses',
        num: 4,
        title: 'Valid Parentheses',
        difficulty: 'Easy',
        type: 'Coding',
        tags: ['Coding', 'Stack', 'Strings'],
        solvedCount: '6.3K solved',
        timeEstimate: '15–20 mins',
        description: `Given a string <code>s</code> containing just the characters <code>'('</code>, <code>')'</code>, <code>'{'</code>, <code>'}'</code>, <code>'['</code> and <code>']'</code>, determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.`,
        examples: [
          { input: 's = "()"', output: 'true', explanation: 'Matching pair of parentheses.' },
          { input: 's = "()[]{}"', output: 'true', explanation: 'All three pairs properly closed.' },
          { input: 's = "(]"', output: 'false', explanation: 'Mismatched closing bracket.' }
        ],
        constraints: [
          '1 <= s.length <= 10^4',
          's consists of parentheses only \'()[]{}\'.'
        ],
        hints: [
          'Use a stack to track open brackets and match them with incoming closing brackets.'
        ],
        referenceSolution: {
          python3: `class Solution:\n    def isValid(self, s: str) -> bool:\n        stack = []\n        mapping = {")": "(", "}": "{", "]": "["}\n        for char in s:\n            if char in mapping:\n                top = stack.pop() if stack else "#"\n                if mapping[char] != top:\n                    return False\n            else:\n                stack.append(char)\n        return not stack`
        },
        starterCode: { python3: '', javascript: '', java: '', cpp: '' },
        testCases: [
          { input: 's = "()"', expected: 'true' },
          { input: 's = "()[]{}"', expected: 'true' },
          { input: 's = "(]"', expected: 'false' }
        ]
      },
      {
        id: 'time-complexity-basics',
        num: 5,
        title: 'Time Complexity Basics',
        difficulty: 'Easy',
        type: 'Conceptual',
        tags: ['Conceptual', 'Algorithms', 'Theory'],
        solvedCount: '5.9K solved',
        timeEstimate: '5–10 mins',
        description: `What is the time complexity of binary search on a sorted array of size N?

Explain the halving principle: each iteration divides the search space into half (N, N/2, N/4 ... 1). Thus, 2^k = N implies k = log2(N).`,
        examples: [
          { input: 'Search in 1024 elements', output: 'O(log N) -> 10 iterations max', explanation: '2^10 = 1024' }
        ],
        constraints: [
          'Array must be sorted',
          'Random access in O(1)'
        ],
        hints: [
          'Binary search repeatedly halves the search space.'
        ],
        referenceSolution: {
          python3: `def binarySearchTimeComplexity(n):\n    return "O(log N)"`
        },
        starterCode: { python3: '', javascript: '', java: '', cpp: '' },
        testCases: [
          { input: 'Array length = 1024', expected: 'log2(1024) = 10 comparisons' }
        ]
      },
      {
        id: 'merge-two-sorted-arrays',
        num: 6,
        title: 'Merge Two Sorted Arrays',
        difficulty: 'Easy',
        type: 'Coding',
        tags: ['Coding', 'Arrays', 'Two Pointers'],
        solvedCount: '4.1K solved',
        timeEstimate: '20–30 mins',
        description: `You are given two integer arrays <code>nums1</code> and <code>nums2</code>, sorted in non-decreasing order.

Merge <code>nums2</code> into <code>nums1</code> as one sorted array.`,
        examples: [
          {
            input: 'nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3',
            output: '[1,2,2,3,5,6]',
            explanation: 'Merged array is [1,2,2,3,5,6].'
          }
        ],
        constraints: [
          'nums1.length == m + n',
          'nums2.length == n'
        ],
        hints: [
          'Start filling nums1 from the back to avoid overwriting elements.'
        ],
        referenceSolution: {
          python3: `class Solution:\n    def merge(self, nums1: list[int], m: int, nums2: list[int], n: int) -> None:\n        p1, p2, p = m - 1, n - 1, m + n - 1\n        while p2 >= 0:\n            if p1 >= 0 and nums1[p1] > nums2[p2]:\n                nums1[p] = nums1[p1]\n                p1 -= 1\n            else:\n                nums1[p] = nums2[p2]\n                p2 -= 1\n            p -= 1`
        },
        starterCode: { python3: '', javascript: '', java: '', cpp: '' },
        testCases: [
          { input: 'nums1 = [1,2,3,0,0,0], m = 3\nnums2 = [2,5,6], n = 3', expected: '[1,2,2,3,5,6]' }
        ]
      }
    ];
  }

  init() {
    this.render();
  }

  setStep(step) {
    this.currentStep = step;
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  selectSubject(subjectName) {
    this.selectedSubject = subjectName;
    this.render();
  }

  selectDifficulty(diffName) {
    this.selectedDifficulty = diffName;
    this.render();
  }

  setProblemFilter(filter) {
    this.problemFilter = filter;
    this.render();
  }

  setSortBy(sort) {
    this.sortBy = sort;
    this.render();
  }

  searchSubjects(query) {
    this.searchQuery = (query || '').toLowerCase().trim();
    this.renderSubjectsList();
  }

  openProblem(problemId) {
    this.currentProblemId = problemId;
    this.currentStep = 4; // IDE
    this.selectedLanguage = 'python3';
    this.activeIdeTab = 'description';
    this.activeRightTab = 'testcases';
    this.activeTestCaseIndex = 0;
    this.render();
    const editor = document.getElementById('codelabCodeEditor');
    if (editor) {
      editor.value = '';
    }
    this.updateLineNumbers();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  backToProblems() {
    this.currentStep = 3;
    this.stopTimer();
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setLanguage(lang) {
    this.selectedLanguage = 'python3';
    this.updateLineNumbers();
  }

  resetCode() {
    const editor = document.getElementById('codelabCodeEditor');
    if (editor) {
      editor.value = '';
      this.updateLineNumbers();
      if (window.app && window.app.showToast) {
        window.app.showToast('Code editor cleared', 'rotate-left');
      }
    }
  }

  setIdeTab(tab) {
    this.activeIdeTab = tab;
    document.querySelectorAll('.codelab-tab[data-ide-tab]').forEach(t => {
      t.classList.toggle('active', t.dataset.ideTab === tab);
    });
    this.renderIdeTabContent();
  }

  setRightTab(tab) {
    this.activeRightTab = tab;
    document.querySelectorAll('.codelab-tab[data-right-tab]').forEach(t => {
      t.classList.toggle('active', t.dataset.rightTab === tab);
    });
    const testcaseBody = document.getElementById('codelabTestcaseBody');
    const outputBody = document.getElementById('codelabOutputBody');
    if (testcaseBody && outputBody) {
      testcaseBody.style.display = tab === 'testcases' ? 'block' : 'none';
      outputBody.style.display = tab === 'output' ? 'block' : 'none';
    }
  }

  selectTestCase(idx) {
    this.activeTestCaseIndex = idx;
    document.querySelectorAll('.codelab-case-chip').forEach((c, i) => {
      c.classList.toggle('active', i === idx);
    });
    const prob = this.problems.find(p => p.id === this.currentProblemId) || this.problems[0];
    const box = document.getElementById('codelabTestCaseData');
    if (box && prob.testCases[idx]) {
      box.textContent = prob.testCases[idx].input;
    }
  }

  toggleTimer() {
    if (this.timerRunning) {
      this.stopTimer();
    } else {
      this.startTimer();
    }
  }

  startTimer() {
    this.timerRunning = true;
    const btn = document.getElementById('codelabTimerBtn');
    if (btn) btn.textContent = 'Pause Timer';
    this.timerInterval = setInterval(() => {
      this.timerSeconds++;
      this.updateTimerDisplay();
    }, 1000);
  }

  stopTimer() {
    this.timerRunning = false;
    clearInterval(this.timerInterval);
    const btn = document.getElementById('codelabTimerBtn');
    if (btn) btn.textContent = 'Start Timer';
  }

  updateTimerDisplay() {
    const el = document.getElementById('codelabTimerClock');
    if (!el) return;
    const hrs = String(Math.floor(this.timerSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((this.timerSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(this.timerSeconds % 60).padStart(2, '0');
    el.textContent = `${hrs}:${mins}:${secs}`;
  }

  updateLineNumbers() {
    const editor = document.getElementById('codelabCodeEditor');
    const numEl = document.getElementById('codelabLineNumbers');
    if (!editor || !numEl) return;
    const lineCount = editor.value ? editor.value.split('\n').length : 1;
    numEl.innerHTML = Array.from({ length: Math.max(lineCount, 15) }, (_, i) => i + 1).join('<br>');
  }

  executePython3(codeStr, testCase, problemId) {
    if (!codeStr || !codeStr.trim()) {
      return { status: 'EMPTY', message: 'Please write your solution first.' };
    }

    try {
      const jsCode = this.transpilePython3ToJS(codeStr);
      return this.evaluateTranspiledJS(jsCode, testCase, problemId);
    } catch (err) {
      let errorMsg = err.message || String(err);
      if (err instanceof SyntaxError || errorMsg.toLowerCase().includes('syntaxerror') || errorMsg.includes('expected')) {
        if (!errorMsg.startsWith('SyntaxError')) {
          errorMsg = 'SyntaxError: ' + errorMsg;
        }
      } else if (err instanceof ReferenceError || errorMsg.includes('ReferenceError') || errorMsg.includes('is not defined')) {
        const varName = errorMsg.split(' ')[0] || 'variable';
        errorMsg = `NameError: name '${varName.replace(/['"]/g, '')}' is not defined`;
      }
      return {
        status: 'RUNTIME_ERROR',
        output: errorMsg
      };
    }
  }

  transpilePython3ToJS(pyCode) {
    const lines = pyCode.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const matchControl = trimmed.match(/^(if|elif|else|for|while|def|class|try|except|finally|with)\b(.*)$/);
      if (matchControl) {
        const rest = matchControl[2].split('#')[0].trim();
        if (!rest.endsWith(':')) {
          throw new SyntaxError(`expected ':' at line ${i + 1}`);
        }
      }
    }

    let paren = 0, bracket = 0, brace = 0;
    for (let char of pyCode) {
      if (char === '(') paren++;
      if (char === ')') paren--;
      if (char === '[') bracket++;
      if (char === ']') bracket--;
      if (char === '{') brace++;
      if (char === '}') brace--;
    }
    if (paren !== 0 || bracket !== 0 || brace !== 0) {
      throw new SyntaxError('unbalanced brackets or parentheses');
    }

    const indentStack = [0];
    const outLines = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const commentIdx = rawLine.indexOf('#');
      let lineNoComment = commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine;
      
      if (!lineNoComment.trim()) continue;

      const indent = rawLine.search(/\S/);
      const currentIndent = indentStack[indentStack.length - 1];

      if (indent > currentIndent) {
        indentStack.push(indent);
        if (outLines.length > 0) {
          outLines[outLines.length - 1] += ' {';
        }
      } else if (indent < currentIndent) {
        while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
          indentStack.pop();
          outLines.push('}');
        }
      }

      let codeLine = lineNoComment.trim();

      codeLine = codeLine.replace(/->\s*[^:]+:/, ':');
      codeLine = codeLine.replace(/:\s*[^,):=]+/g, '');

      if (codeLine.startsWith('class ')) {
        const className = codeLine.replace('class ', '').replace(':', '').trim();
        outLines.push(`class ${className}`);
        continue;
      }

      if (codeLine.startsWith('def ')) {
        let defContent = codeLine.replace('def ', '').replace(':', '').trim();
        const firstParen = defContent.indexOf('(');
        const funcName = defContent.slice(0, firstParen).trim();
        let argsStr = defContent.slice(firstParen + 1, defContent.lastIndexOf(')')).trim();
        
        const args = argsStr.split(',').map(a => a.trim()).filter(a => a && a !== 'self');
        const cleanArgs = args.join(', ');

        if (indentStack.length > 1) {
          outLines.push(`${funcName}(${cleanArgs})`);
        } else {
          outLines.push(`function ${funcName}(${cleanArgs})`);
        }
        continue;
      }

      codeLine = codeLine
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/\belif\b/g, 'else if')
        .replace(/\bpass\b/g, '/* pass */')
        .replace(/\bself\./g, 'this.')
        .replace(/\band\b/g, '&&')
        .replace(/\bor\b/g, '||')
        .replace(/\bnot\s+/g, '!')
        .replace(/\bis\s+not\b/g, '!==')
        .replace(/\bis\b/g, '===');

      if (codeLine.endsWith(':')) {
        codeLine = codeLine.slice(0, -1).trim();
      }

      if (codeLine.startsWith('for ')) {
        const enumMatch = codeLine.match(/^for\s+(.+)\s+in\s+enumerate\((.+)\)$/);
        if (enumMatch) {
          const vars = enumMatch[1].trim();
          const target = enumMatch[2].trim();
          outLines.push(`for (let [${vars}] of py_enumerate(${target}))`);
          continue;
        }

        const rangeMatch = codeLine.match(/^for\s+(.+)\s+in\s+range\((.+)\)$/);
        if (rangeMatch) {
          const varName = rangeMatch[1].trim();
          const rangeArgs = rangeMatch[2].trim();
          outLines.push(`for (let ${varName} of py_range(${rangeArgs}))`);
          continue;
        }

        const inMatch = codeLine.match(/^for\s+(.+)\s+in\s+(.+)$/);
        if (inMatch) {
          const varName = inMatch[1].trim();
          const target = inMatch[2].trim();
          outLines.push(`for (let ${varName} of ${target})`);
          continue;
        }
      }

      if (codeLine.startsWith('while ')) {
        const cond = codeLine.replace(/^while\s+/, '').trim();
        outLines.push(`while (${cond})`);
        continue;
      }

      if (codeLine.startsWith('if ') || codeLine.startsWith('else if ')) {
        const isElseIf = codeLine.startsWith('else if ');
        const cond = codeLine.replace(/^(if|else if)\s+/, '').trim();
        outLines.push(`${isElseIf ? 'else if' : 'if'} (${cond})`);
        continue;
      }

      if (codeLine === 'else') {
        outLines.push('else');
        continue;
      }

      codeLine = codeLine.replace(/([a-zA-Z0-9_$.]+)\s+in\s+([a-zA-Z0-9_$.]+)/g, 'py_in($1, $2)');
      codeLine = codeLine.replace(/\.append\(/g, '.push(');
      codeLine = codeLine.replace(/\blen\(([^)]+)\)/g, 'py_len($1)');

      if (codeLine.includes('=') && !codeLine.includes('==') && !codeLine.includes('!=') && !codeLine.includes('<=') && !codeLine.includes('>=')) {
        const parts = codeLine.split('=');
        const left = parts[0].trim();
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(left) && !['this', 'self', 'window'].includes(left)) {
          codeLine = `let ${codeLine}`;
        }
      }

      outLines.push(codeLine + ';');
    }

    while (indentStack.length > 1) {
      indentStack.pop();
      outLines.push('}');
    }

    return outLines.join('\n');
  }

  evaluateTranspiledJS(jsCode, testCase, problemId) {
    const py_len = (obj) => (obj == null ? 0 : (Array.isArray(obj) || typeof obj === 'string' ? obj.length : Object.keys(obj).length));
    const py_range = (a, b, c = 1) => {
      let start = a, stop = b, step = c;
      if (stop === undefined) { stop = start; start = 0; }
      const res = [];
      if (step > 0) { for (let i = start; i < stop; i += step) res.push(i); }
      else if (step < 0) { for (let i = start; i > stop; i += step) res.push(i); }
      return res;
    };
    const py_enumerate = (arr) => Array.from(arr).map((v, i) => [i, v]);
    const py_in = (item, container) => {
      if (container == null) return false;
      if (Array.isArray(container) || typeof container === 'string') return container.includes(item);
      if (typeof container === 'object') return Object.prototype.hasOwnProperty.call(container, item) || item in container;
      return false;
    };

    const inputLines = testCase.input.split('\n');
    const env = {};
    for (let line of inputLines) {
      if (line.includes('=')) {
        const eqIdx = line.indexOf('=');
        const varName = line.slice(0, eqIdx).trim();
        const valStr = line.slice(eqIdx + 1).trim();
        try {
          env[varName] = JSON.parse(valStr.replace(/'/g, '"'));
        } catch (e) {
          env[varName] = valStr;
        }
      }
    }

    const evalFunc = new Function('py_len', 'py_range', 'py_enumerate', 'py_in', 'env', `
      "use strict";
      ${Object.keys(env).map(k => `let ${k} = env['${k}'];`).join('\n')}
      
      ${jsCode}

      if (typeof Solution !== 'undefined') {
        const sol = new Solution();
        if (typeof sol.twoSum === 'function') return sol.twoSum(nums, target);
        if (typeof sol.reverseString === 'function') {
          const ret = sol.reverseString(s);
          return ret !== undefined ? ret : s;
        }
        if (typeof sol.isValid === 'function') return sol.isValid(s);
        if (typeof sol.merge === 'function') {
          const ret = sol.merge(nums1, m, nums2, n);
          return ret !== undefined ? ret : nums1;
        }
      }

      if (typeof twoSum === 'function') return twoSum(nums, target);
      if (typeof reverseString === 'function') {
        const ret = reverseString(s);
        return ret !== undefined ? ret : s;
      }
      if (typeof isValid === 'function') return isValid(s);
      if (typeof merge === 'function') {
        const ret = merge(nums1, m, nums2, n);
        return ret !== undefined ? ret : nums1;
      }

      if (typeof stack !== 'undefined') return typeof stack.pop === 'function' ? stack.pop() : stack;
      if (typeof result !== 'undefined') return result;
      if (typeof ans !== 'undefined') return ans;
      if (typeof s !== 'undefined') return s;
      if (typeof nums1 !== 'undefined') return nums1;

      return null;
    `);

    const gotVal = evalFunc(py_len, py_range, py_enumerate, py_in, env);
    const gotStr = JSON.stringify(gotVal);

    let expectedStr = testCase.expected.trim();
    let expectedObj = expectedStr;
    try {
      expectedObj = JSON.parse(expectedStr.replace(/'/g, '"'));
    } catch (e) {}

    const isMatch = (JSON.stringify(gotVal) === JSON.stringify(expectedObj)) || (String(gotVal) === String(expectedStr)) || (gotStr === expectedStr);

    if (isMatch) {
      return {
        status: 'CORRECT',
        got: gotStr,
        expected: expectedStr
      };
    } else {
      return {
        status: 'WRONG_ANSWER',
        got: gotStr,
        expected: expectedStr
      };
    }
  }

  runCode() {
    const editor = document.getElementById('codelabCodeEditor');
    const code = editor ? editor.value : '';

    if (!code || !code.trim()) {
      this.setRightTab('output');
      const outputEl = document.getElementById('codelabOutputBody');
      if (outputEl) {
        outputEl.innerHTML = `
          <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-md); padding: 1rem; color: #ef4444; font-weight: 700; font-size: 0.9rem;">
            <i class="fa-solid fa-circle-exclamation" style="margin-right: 0.4rem;"></i> Please write your solution first.
          </div>
        `;
      }
      if (window.app && window.app.showToast) {
        window.app.showToast('Please write your solution first.', 'circle-exclamation');
      }
      return;
    }

    const btn = document.getElementById('codelabRunBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executing Python3 Code...';
    }

    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-play"></i> Run Code <span style="font-size: 0.72rem; opacity: 0.8; margin-left: 0.25rem;">(Ctrl + Enter)</span>';
      }

      this.setRightTab('output');
      const prob = this.problems.find(p => p.id === this.currentProblemId) || this.problems[0];
      const tc = prob.testCases[this.activeTestCaseIndex] || prob.testCases[0];

      const res = this.executePython3(code, tc, prob.id);
      const outputEl = document.getElementById('codelabOutputBody');

      if (outputEl) {
        if (res.status === 'CORRECT') {
          outputEl.innerHTML = `
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-weight: 800; color: #059669; font-size: 1.05rem; display: flex; align-items: center; gap: 0.4rem;">
                  <i class="fa-solid fa-circle-check"></i> ✓ Correct Answer
                </span>
                <span style="font-size: 0.75rem; background: #10b981; color: #fff; padding: 0.15rem 0.55rem; border-radius: 9999px; font-weight: 700;">
                  Passed
                </span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-primary); margin-top: 0.5rem;">
                <strong>Output:</strong> <code style="background: #1e293b; color: #38bdf8; padding: 0.2rem 0.5rem; border-radius: 4px;">${res.got}</code>
              </div>
            </div>
            <div style="font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.4rem;">Test Case Execution Summary:</div>
            <pre style="background: #161922; color: #f8fafc; padding: 0.85rem 1rem; border-radius: var(--radius-md); font-family: monospace; font-size: 0.82rem; line-height: 1.5; margin: 0 0 1rem 0;">Test Case ${this.activeTestCaseIndex + 1}: ${tc.input.replace(/\n/g, ' | ')}
Expected: ${res.expected} | Got: ${res.got} ✓</pre>
          `;
          if (window.app && window.app.showToast) {
            window.app.showToast('✓ Correct Answer!', 'circle-check');
          }
        } else if (res.status === 'WRONG_ANSWER') {
          outputEl.innerHTML = `
            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-weight: 800; color: #ef4444; font-size: 1.05rem; display: flex; align-items: center; gap: 0.4rem;">
                  <i class="fa-solid fa-circle-xmark"></i> ✗ Wrong Answer
                </span>
                <span style="font-size: 0.75rem; background: #ef4444; color: #fff; padding: 0.15rem 0.55rem; border-radius: 9999px; font-weight: 700;">
                  Failed
                </span>
              </div>
              <div style="font-size: 0.85rem; font-family: monospace; line-height: 1.6; margin-top: 0.5rem;">
                <div style="margin-bottom: 0.25rem;"><strong>Your Output:</strong></div>
                <pre style="background: #1e293b; color: #f87171; padding: 0.5rem 0.75rem; border-radius: 4px; margin: 0 0 0.75rem 0;">${res.got}</pre>
                <div style="margin-bottom: 0.25rem;"><strong>Expected Output:</strong></div>
                <pre style="background: #1e293b; color: #4ade80; padding: 0.5rem 0.75rem; border-radius: 4px; margin: 0;">${res.expected}</pre>
              </div>
            </div>
          `;
          if (window.app && window.app.showToast) {
            window.app.showToast('✗ Wrong Answer', 'circle-xmark');
          }
        } else {
          outputEl.innerHTML = `
            <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-weight: 800; color: #d97706; font-size: 1.05rem; display: flex; align-items: center; gap: 0.4rem;">
                  <i class="fa-solid fa-triangle-exclamation"></i> Runtime Error
                </span>
              </div>
              <pre style="background: #1e293b; color: #fbbf24; padding: 0.75rem 1rem; border-radius: 4px; font-family: monospace; font-size: 0.84rem; line-height: 1.5; margin: 0.5rem 0 0 0; white-space: pre-wrap;">${res.output}</pre>
            </div>
          `;
          if (window.app && window.app.showToast) {
            window.app.showToast('Runtime Error', 'triangle-exclamation');
          }
        }
      }
    }, 400);
  }

  submitSolution() {
    const editor = document.getElementById('codelabCodeEditor');
    const code = editor ? editor.value : '';

    if (!code || !code.trim()) {
      this.setRightTab('output');
      const outputEl = document.getElementById('codelabOutputBody');
      if (outputEl) {
        outputEl.innerHTML = `
          <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-md); padding: 1rem; color: #ef4444; font-weight: 700; font-size: 0.9rem;">
            <i class="fa-solid fa-circle-exclamation" style="margin-right: 0.4rem;"></i> Please write your solution first.
          </div>
        `;
      }
      if (window.app && window.app.showToast) {
        window.app.showToast('Please write your solution first.', 'circle-exclamation');
      }
      return;
    }

    const btn = document.getElementById('codelabSubmitBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Evaluating Solution...';
    }

    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Solution';
      }

      this.setRightTab('output');
      const prob = this.problems.find(p => p.id === this.currentProblemId) || this.problems[0];
      
      let allPassed = true;
      let firstFailure = null;

      for (let i = 0; i < prob.testCases.length; i++) {
        const tc = prob.testCases[i];
        const res = this.executePython3(code, tc, prob.id);
        if (res.status !== 'CORRECT') {
          allPassed = false;
          firstFailure = { tcIndex: i + 1, tc, res };
          break;
        }
      }

      const outputEl = document.getElementById('codelabOutputBody');
      if (outputEl) {
        if (allPassed) {
          if (!this.submittedProblemIds.has(prob.id)) {
            this.submittedProblemIds.add(prob.id);
            this.solvedCount++;
          }
          const progEl = document.getElementById('codelabSolvedCountText');
          if (progEl) progEl.textContent = `${this.solvedCount} Solved`;

          outputEl.innerHTML = `
            <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.05)); border: 1.5px solid #10b981; border-radius: var(--radius-lg); padding: 1.25rem; text-align: center; margin-bottom: 1rem;">
              <div style="font-size: 2.2rem; margin-bottom: 0.4rem;">🎉</div>
              <h3 style="font-size: 1.25rem; font-weight: 800; color: #059669; margin: 0 0 0.35rem 0;">Solution Accepted & Submitted!</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 0.85rem 0;">
                Great work! You solved <strong>${prob.title}</strong>. Redirecting to problems list...
              </p>
              <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: #10b981; color: #ffffff; padding: 0.35rem 0.9rem; border-radius: 9999px; font-weight: 800; font-size: 0.82rem;">
                <i class="fa-solid fa-check"></i> Redirecting...
              </div>
            </div>
          `;
          if (window.app && window.app.showToast) {
            window.app.showToast(`🎉 Solution Accepted & Submitted! Redirecting...`, 'trophy');
          }

          setTimeout(() => {
            this.backToProblems();
          }, 1200);
        } else if (firstFailure.res.status === 'WRONG_ANSWER') {
          outputEl.innerHTML = `
            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-weight: 800; color: #ef4444; font-size: 1.05rem; display: flex; align-items: center; gap: 0.4rem;">
                  <i class="fa-solid fa-circle-xmark"></i> ✗ Wrong Answer
                </span>
                <span style="font-size: 0.75rem; background: #ef4444; color: #fff; padding: 0.15rem 0.55rem; border-radius: 9999px; font-weight: 700;">
                  Failed on Test Case ${firstFailure.tcIndex}
                </span>
              </div>
              <div style="font-size: 0.85rem; font-family: monospace; line-height: 1.6; margin-top: 0.5rem;">
                <div style="margin-bottom: 0.25rem;"><strong>Your Output:</strong></div>
                <pre style="background: #1e293b; color: #f87171; padding: 0.5rem 0.75rem; border-radius: 4px; margin: 0 0 0.75rem 0;">${firstFailure.res.got}</pre>
                <div style="margin-bottom: 0.25rem;"><strong>Expected Output:</strong></div>
                <pre style="background: #1e293b; color: #4ade80; padding: 0.5rem 0.75rem; border-radius: 4px; margin: 0;">${firstFailure.res.expected}</pre>
              </div>
            </div>
          `;
          if (window.app && window.app.showToast) {
            window.app.showToast(`✗ Wrong Answer on Test Case ${firstFailure.tcIndex}`, 'circle-xmark');
          }
        } else {
          outputEl.innerHTML = `
            <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-weight: 800; color: #d97706; font-size: 1.05rem; display: flex; align-items: center; gap: 0.4rem;">
                  <i class="fa-solid fa-triangle-exclamation"></i> Runtime Error
                </span>
                <span style="font-size: 0.75rem; background: #d97706; color: #fff; padding: 0.15rem 0.55rem; border-radius: 9999px; font-weight: 700;">
                  Test Case ${firstFailure.tcIndex}
                </span>
              </div>
              <pre style="background: #1e293b; color: #fbbf24; padding: 0.75rem 1rem; border-radius: 4px; font-family: monospace; font-size: 0.84rem; line-height: 1.5; margin: 0.5rem 0 0 0; white-space: pre-wrap;">${firstFailure.res.output}</pre>
            </div>
          `;
          if (window.app && window.app.showToast) {
            window.app.showToast('Runtime Error', 'triangle-exclamation');
          }
        }
      }
    }, 500);
  }

  render() {
    const container = document.getElementById('view-codelab');
    if (!container) return;

    if (this.currentStep === 4) {
      this.renderIdeView(container);
    } else {
      this.renderWorkflowView(container);
    }
  }

  renderWorkflowView(container) {
    const isStep1 = this.currentStep === 1;
    const isStep2 = this.currentStep === 2;
    const isStep3 = this.currentStep === 3;

    container.innerHTML = `
      <div class="codelab-wrapper">
        <!-- Top Banner with Logo & Progress Card -->
        <div class="codelab-header-card">
          <div class="codelab-header-left">
            <div class="codelab-logo-icon">
              <i class="fa-solid fa-code"></i>
            </div>
            <div>
              <h2 class="codelab-header-title">Code Lab</h2>
              <p class="codelab-header-subtitle">Practice, solve, and master real-world problems.</p>
            </div>
          </div>
          <div class="codelab-progress-widget" onclick="window.codelab.setStep(3)">
            <div class="codelab-progress-icon">
              <i class="fa-solid fa-trophy"></i>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase;">Your Progress</div>
              <div id="codelabSolvedCountText" style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); line-height: 1.2;">
                ${this.solvedCount} Solved
              </div>
              <div style="font-size: 0.72rem; color: #10b981; font-weight: 700;">Great job! Keep going!</div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color: var(--text-muted); font-size: 0.85rem; margin-left: 0.25rem;"></i>
          </div>
        </div>

        <!-- Multi-Step Stepper -->
        <div class="codelab-stepper-container">
          <div class="codelab-step-item ${isStep1 ? 'active' : 'completed'}" onclick="window.codelab.setStep(1)">
            <div class="codelab-step-badge">
              ${isStep1 ? '1' : '<i class="fa-solid fa-check"></i>'}
            </div>
            <span class="codelab-step-label">Select Subject</span>
          </div>

          <div class="codelab-step-line ${!isStep1 ? 'completed' : ''}"></div>

          <div class="codelab-step-item ${isStep2 ? 'active' : (isStep3 ? 'completed' : '')}" onclick="window.codelab.setStep(2)">
            <div class="codelab-step-badge">
              ${isStep3 ? '<i class="fa-solid fa-check"></i>' : '2'}
            </div>
            <span class="codelab-step-label">Choose Difficulty</span>
          </div>

          <div class="codelab-step-line ${isStep3 ? 'completed' : ''}"></div>

          <div class="codelab-step-item ${isStep3 ? 'active' : ''}" onclick="window.codelab.setStep(3)">
            <div class="codelab-step-badge">3</div>
            <span class="codelab-step-label">Start Solving</span>
          </div>
        </div>

        <!-- Dynamic Step Content -->
        ${isStep1 ? this.renderStep1Html() : (isStep2 ? this.renderStep2Html() : this.renderStep3Html())}
      </div>
    `;
  }

  renderStep1Html() {
    return `
      <div>
        <div class="codelab-section-header">
          <div>
            <h3 class="codelab-section-title">1. Select a Subject</h3>
            <p class="codelab-section-desc">Choose the subject you want to practice.</p>
          </div>
          <div class="codelab-search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" class="codelab-search-input" placeholder="Search subjects..." oninput="window.codelab.searchSubjects(this.value)">
          </div>
        </div>

        <div class="codelab-subjects-grid" id="codelabSubjectsGrid">
          ${this.renderSubjectsCardsHtml()}
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
          <button class="btn btn-primary" style="padding: 0.75rem 2rem; border-radius: var(--radius-md); font-weight: 800;" onclick="window.codelab.setStep(2)">
            Next <i class="fa-solid fa-arrow-right" style="margin-left: 0.35rem;"></i>
          </button>
        </div>
      </div>
    `;
  }

  renderSubjectsCardsHtml() {
    const q = this.searchQuery;
    const filtered = this.subjects.filter(s => !q || s.name.toLowerCase().includes(q));

    return filtered.map(s => {
      const isSelected = s.name === this.selectedSubject;
      return `
        <div class="codelab-subject-card ${isSelected ? 'selected' : ''}" onclick="window.codelab.selectSubject('${s.name}')">
          <div class="codelab-card-check"><i class="fa-solid fa-check"></i></div>
          <div class="codelab-subject-icon-box" style="background: ${s.bg}; color: ${s.color};">
            ${s.iconType === 'text' ? `<span style="font-family: monospace; font-weight: 800;">${s.icon}</span>` : `<i class="${s.icon}"></i>`}
          </div>
          <div class="codelab-subject-name">${s.name}</div>
          <div class="codelab-subject-count">${s.problems}</div>
        </div>
      `;
    }).join('');
  }

  renderSubjectsList() {
    const grid = document.getElementById('codelabSubjectsGrid');
    if (grid) grid.innerHTML = this.renderSubjectsCardsHtml();
  }

  renderStep2Html() {
    return `
      <div>
        <div style="margin-bottom: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
            <button class="codelab-back-btn" onclick="window.codelab.setStep(1)">
              <i class="fa-solid fa-arrow-left"></i> Back
            </button>
            <button class="btn btn-primary btn-sm" onclick="window.codelab.setStep(3)" style="padding: 0.55rem 1.4rem; border-radius: var(--radius-full); font-weight: 800;">
              Next <i class="fa-solid fa-arrow-right" style="margin-left: 0.35rem;"></i>
            </button>
          </div>
          <h3 class="codelab-section-title">2. Choose Difficulty</h3>
          <p class="codelab-section-desc">Select the difficulty level that matches your current skill level. You can change this anytime.</p>
        </div>

        <div class="codelab-difficulty-grid">
          ${this.difficulties.map(d => {
      const isSelected = d.name === this.selectedDifficulty;
      return `
              <div class="codelab-diff-card ${isSelected ? 'selected' : ''}" onclick="window.codelab.selectDifficulty('${d.name}')">
                <div class="codelab-card-check"><i class="fa-solid fa-check"></i></div>
                <div class="codelab-diff-icon-box" style="background: ${d.iconBg}; color: ${d.iconColor};">
                  <i class="${d.icon}"></i>
                </div>
                <div class="codelab-diff-title">${d.name}</div>
                <div class="codelab-diff-tagline">${d.tagline}</div>
                <div class="codelab-diff-desc">${d.desc}</div>

                <ul class="codelab-diff-features">
                  ${d.features.map(f => `
                    <li><i class="fa-solid fa-circle-check" style="color: ${d.iconColor}; font-size: 0.95rem;"></i> <span>${f}</span></li>
                  `).join('')}
                </ul>

                <div class="codelab-diff-footer-pill">
                  <i class="fa-solid fa-signal" style="color: ${d.iconColor};"></i>
                  <span>${d.problems}</span>
                  <span style="color: var(--border-medium);">|</span>
                  <span>${d.estTime}</span>
                </div>
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }

  renderStep3Html() {
    let filtered = this.problems.slice();
    if (this.problemFilter === 'CODING') {
      filtered = filtered.filter(p => p.type === 'Coding');
    } else if (this.problemFilter === 'CONCEPTUAL') {
      filtered = filtered.filter(p => p.type === 'Conceptual');
    }

    return `
      <div>
        <div class="codelab-section-header">
          <div>
            <h3 class="codelab-section-title">3. Start Solving</h3>
            <p class="codelab-section-desc">Choose a problem and start practicing. Solve coding or conceptual problems to improve your skills.</p>
          </div>
        </div>

        <!-- Filter Pills Bar & Sort Dropdown -->
        <div class="codelab-filter-bar">
          <div class="codelab-pills-group">
            <button class="codelab-filter-pill ${this.problemFilter === 'ALL' ? 'active' : ''}" onclick="window.codelab.setProblemFilter('ALL')">
              All Problems
            </button>
            <button class="codelab-filter-pill ${this.problemFilter === 'CODING' ? 'active' : ''}" onclick="window.codelab.setProblemFilter('CODING')">
              &lt;/&gt; Coding Problems
            </button>
            <button class="codelab-filter-pill ${this.problemFilter === 'CONCEPTUAL' ? 'active' : ''}" onclick="window.codelab.setProblemFilter('CONCEPTUAL')">
              <i class="fa-regular fa-file-lines" style="margin-right: 0.35rem;"></i> Conceptual Questions
            </button>
            <button class="codelab-filter-pill ${this.problemFilter === 'MIXED' ? 'active' : ''}" onclick="window.codelab.setProblemFilter('MIXED')">
              <i class="fa-solid fa-cubes-stacked" style="margin-right: 0.35rem;"></i> Mixed
            </button>
          </div>

          <div>
            <select class="codelab-sort-dropdown" onchange="window.codelab.setSortBy(this.value)">
              <option value="recommended">Sort by: Recommended</option>
              <option value="solved">Sort by: Most Solved</option>
              <option value="time">Sort by: Fastest Time</option>
            </select>
          </div>
        </div>

        <!-- Problems Rows -->
        <div class="codelab-problems-list">
          ${filtered.map(p => {
            const isSubmitted = this.submittedProblemIds && this.submittedProblemIds.has(p.id);
            return `
            <div class="codelab-problem-row">
              <div class="codelab-problem-left">
                <div class="codelab-problem-num">${p.num}</div>
                <div class="codelab-problem-info">
                  <h4 class="codelab-problem-title" onclick="window.codelab.openProblem('${p.id}')">${p.title}</h4>
                  <p class="codelab-problem-desc">${p.description.split('\n')[0].replace(/<\/?[^>]+(>|$)/g, '')}</p>
                </div>
              </div>

              <div class="codelab-problem-center">
                <span class="codelab-tag ${p.type === 'Coding' ? 'type-coding' : 'type-conceptual'}">
                  ${p.type === 'Coding' ? '&lt;/&gt; Coding' : '<i class="fa-regular fa-file-lines"></i> Conceptual'}
                </span>
                ${p.tags.filter(t => t !== p.type).map(t => `<span class="codelab-tag">${t}</span>`).join('')}
              </div>

              <div class="codelab-problem-meta">
                <div><i class="fa-solid fa-users" style="margin-right: 0.25rem;"></i> ${p.solvedCount}</div>
                <div><i class="fa-regular fa-clock" style="margin-right: 0.25rem;"></i> ${p.timeEstimate}</div>
              </div>

              <div>
                ${isSubmitted ? `
                  <button class="codelab-solve-btn submitted" onclick="window.codelab.openProblem('${p.id}')" style="background: rgba(16, 185, 129, 0.12); color: #059669; border: 1px solid rgba(16, 185, 129, 0.35); font-weight: 700;">
                    Submitted <i class="fa-solid fa-check" style="margin-left: 0.25rem;"></i>
                  </button>
                ` : `
                  <button class="codelab-solve-btn" onclick="window.codelab.openProblem('${p.id}')">
                    Solve <i class="fa-solid fa-arrow-right"></i>
                  </button>
                `}
              </div>
            </div>
          `;
          }).join('')}
        </div>

        <div style="text-align: center; margin: 1.5rem 0;">
          <button class="btn btn-secondary btn-sm" style="border-radius: var(--radius-full); font-weight: 700; padding: 0.45rem 1.5rem;" onclick="window.app.showToast('All available curated problems loaded.', 'check')">
            Show More Problems <i class="fa-solid fa-chevron-down" style="margin-left: 0.35rem;"></i>
          </button>
        </div>

        <!-- Bottom Motivation Banner -->
        <div class="codelab-bottom-banner">
          <div class="codelab-banner-left">
            <div class="codelab-banner-icon"><i class="fa-regular fa-lightbulb"></i></div>
            <div>
              <div class="codelab-banner-title">Keep Going!</div>
              <div class="codelab-banner-desc">Solve more problems to improve your skills, earn badges, and climb the leaderboard.</div>
            </div>
          </div>
          <button class="codelab-leaderboard-btn" onclick="window.app.switchView('view-matches');">
            <i class="fa-solid fa-trophy"></i> View Leaderboard <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;
  }

  renderIdeView(container) {
    const prob = this.problems.find(p => p.id === this.currentProblemId) || this.problems[0];
    const starterCode = prob.starterCode[this.selectedLanguage] || '';

    container.innerHTML = `
      <div class="codelab-ide-wrapper">
        <!-- Top Bar -->
        <div class="codelab-ide-topbar">
          <div class="codelab-ide-topbar-left">
            <button class="codelab-back-btn" onclick="window.codelab.backToProblems()">
              <i class="fa-solid fa-arrow-left"></i> Back to Problems
            </button>
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <h2 class="codelab-ide-title">${prob.title}</h2>
              <span class="codelab-diff-badge ${prob.difficulty.toLowerCase()}">${prob.difficulty}</span>
              ${prob.tags.map(t => `<span class="codelab-tag">${t}</span>`).join('')}
            </div>
          </div>

          <!-- Live Timer Widget -->
          <div class="codelab-timer-widget">
            <i class="fa-regular fa-clock" style="color: var(--text-muted); font-size: 1.05rem;"></i>
            <span id="codelabTimerClock" class="codelab-timer-clock">00:00:00</span>
            <button id="codelabTimerBtn" class="codelab-timer-btn" onclick="window.codelab.toggleTimer()">
              ${this.timerRunning ? 'Pause Timer' : 'Start Timer'}
            </button>
          </div>
        </div>

        <!-- 3-Pane Layout -->
        <div class="codelab-ide-grid">
          <!-- Pane 1: Problem Description -->
          <div class="codelab-pane">
            <div class="codelab-pane-header">
              <div class="codelab-tabs">
                <button class="codelab-tab ${this.activeIdeTab === 'description' ? 'active' : ''}" data-ide-tab="description" onclick="window.codelab.setIdeTab('description')">Description</button>
                <button class="codelab-tab ${this.activeIdeTab === 'examples' ? 'active' : ''}" data-ide-tab="examples" onclick="window.codelab.setIdeTab('examples')">Examples</button>
                <button class="codelab-tab ${this.activeIdeTab === 'constraints' ? 'active' : ''}" data-ide-tab="constraints" onclick="window.codelab.setIdeTab('constraints')">Constraints</button>
                <button class="codelab-tab ${this.activeIdeTab === 'hints' ? 'active' : ''}" data-ide-tab="hints" onclick="window.codelab.setIdeTab('hints')">Hints</button>
              </div>
            </div>
            <div class="codelab-pane-body" id="codelabIdeTabBody">
              ${this.getIdeTabContentHtml(prob)}
            </div>
          </div>

          <!-- Pane 2: Code Editor -->
          <div class="codelab-pane codelab-editor-pane">
            <div class="codelab-editor-header">
              <select class="codelab-lang-select" onchange="window.codelab.setLanguage(this.value)">
                <option value="python3" selected>Python3</option>
              </select>

              <button class="codelab-editor-reset-btn" onclick="window.codelab.resetCode()">
                <i class="fa-solid fa-rotate-left"></i> Reset Code
              </button>
            </div>

            <div class="codelab-code-area-container">
              <div id="codelabLineNumbers" class="codelab-line-numbers">1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9<br>10</div>
              <textarea id="codelabCodeEditor" class="codelab-code-textarea" spellcheck="false" oninput="window.codelab.updateLineNumbers()"></textarea>
            </div>
          </div>

          <!-- Pane 3: Test Cases & Output Execution -->
          <div class="codelab-pane">
            <div class="codelab-pane-header">
              <div class="codelab-tabs">
                <button class="codelab-tab ${this.activeRightTab === 'testcases' ? 'active' : ''}" data-right-tab="testcases" onclick="window.codelab.setRightTab('testcases')">Test Cases</button>
                <button class="codelab-tab ${this.activeRightTab === 'output' ? 'active' : ''}" data-right-tab="output" onclick="window.codelab.setRightTab('output')">Output</button>
              </div>
            </div>

            <div class="codelab-pane-body">
              <!-- Test Cases View -->
              <div id="codelabTestcaseBody" style="${this.activeRightTab === 'testcases' ? 'display: block;' : 'display: none;'}">
                <div class="codelab-testcase-tabs">
                  ${prob.testCases.map((tc, idx) => `
                    <div class="codelab-case-chip ${idx === this.activeTestCaseIndex ? 'active' : ''}" onclick="window.codelab.selectTestCase(${idx})">
                      <div class="codelab-case-dot"></div>
                      <span>Test Case ${idx + 1}</span>
                    </div>
                  `).join('')}
                </div>

                <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.35rem;">Input:</div>
                <div id="codelabTestCaseData" class="codelab-testcase-box">${prob.testCases[this.activeTestCaseIndex]?.input || ''}</div>
              </div>

              <!-- Output Execution View -->
              <div id="codelabOutputBody" style="${this.activeRightTab === 'output' ? 'display: block;' : 'display: none;'}">
                <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.88rem;">
                  <i class="fa-solid fa-terminal" style="font-size: 1.8rem; margin-bottom: 0.6rem; opacity: 0.6;"></i>
                  <div>Click <strong>Run Code</strong> to execute test cases against your solution.</div>
                </div>
              </div>
            </div>

            <!-- Execution Action Buttons -->
            <div class="codelab-ide-actions">
              <button id="codelabRunBtn" class="codelab-run-btn" onclick="window.codelab.runCode()">
                <i class="fa-solid fa-play"></i> Run Code <span style="font-size: 0.72rem; opacity: 0.8; margin-left: 0.25rem;">(Ctrl + Enter)</span>
              </button>
              <button id="codelabSubmitBtn" class="codelab-submit-btn" onclick="window.codelab.submitSolution()">
                <i class="fa-solid fa-paper-plane"></i> Submit Solution
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.updateTimerDisplay();
  }

  getIdeTabContentHtml(prob) {
    if (this.activeIdeTab === 'description') {
      return `
        <div style="font-size: 0.88rem; line-height: 1.6; color: var(--text-primary); margin-bottom: 1.25rem;">
          ${prob.description.replace(/\n/g, '<br>')}
        </div>

        ${prob.examples.map((ex, idx) => `
          <div style="margin-bottom: 1.25rem;">
            <div style="font-weight: 800; font-size: 0.88rem; margin-bottom: 0.35rem;">Example ${idx + 1}:</div>
            <div style="background: var(--bg-subtle); border-radius: var(--radius-md); padding: 0.85rem 1rem; font-family: monospace; font-size: 0.82rem; line-height: 1.5;">
              <div><strong>Input:</strong> ${ex.input}</div>
              <div><strong>Output:</strong> ${ex.output}</div>
              ${ex.explanation ? `<div><strong>Explanation:</strong> ${ex.explanation}</div>` : ''}
            </div>
          </div>
        `).join('')}

        <div style="font-weight: 800; font-size: 0.88rem; margin-bottom: 0.35rem;">Constraints:</div>
        <ul style="padding-left: 1.25rem; margin: 0; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.6;">
          ${prob.constraints.map(c => `<li><code>${c}</code></li>`).join('')}
        </ul>
      `;
    } else if (this.activeIdeTab === 'examples') {
      return prob.examples.map((ex, idx) => `
        <div style="margin-bottom: 1.25rem;">
          <div style="font-weight: 800; font-size: 0.88rem; margin-bottom: 0.35rem;">Example ${idx + 1}:</div>
          <div style="background: var(--bg-subtle); border-radius: var(--radius-md); padding: 0.85rem 1rem; font-family: monospace; font-size: 0.82rem; line-height: 1.5;">
            <div><strong>Input:</strong> ${ex.input}</div>
            <div><strong>Output:</strong> ${ex.output}</div>
            ${ex.explanation ? `<div><strong>Explanation:</strong> ${ex.explanation}</div>` : ''}
          </div>
        </div>
      `).join('');
    } else if (this.activeIdeTab === 'constraints') {
      return `
        <div style="font-weight: 800; font-size: 0.88rem; margin-bottom: 0.5rem;">Constraints:</div>
        <ul style="padding-left: 1.25rem; margin: 0; font-size: 0.84rem; color: var(--text-secondary); line-height: 1.8;">
          ${prob.constraints.map(c => `<li><code>${c}</code></li>`).join('')}
        </ul>
      `;
    } else if (this.activeIdeTab === 'hints') {
      return `
        <div style="font-weight: 800; font-size: 0.88rem; margin-bottom: 0.5rem;">Problem Hints:</div>
        ${prob.hints.map((h, i) => `
          <div style="background: rgba(37, 99, 235, 0.05); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: var(--radius-md); padding: 0.85rem 1rem; font-size: 0.84rem; line-height: 1.5; margin-bottom: 0.75rem;">
            <strong>Hint ${i + 1}:</strong> ${h}
          </div>
        `).join('')}
      `;
    }
    return '';
  }

  renderIdeTabContent() {
    const prob = this.problems.find(p => p.id === this.currentProblemId) || this.problems[0];
    const body = document.getElementById('codelabIdeTabBody');
    if (body) {
      body.innerHTML = this.getIdeTabContentHtml(prob);
    }
  }
}

// Global instance
window.codelab = new CodeLabModule();
