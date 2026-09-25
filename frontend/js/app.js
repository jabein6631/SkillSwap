/**
 * SkillSwap Platform - Main Application Controller
 * Features: AI Dynamic 20-Question Quiz Generator, Response Storage,
 * Percentage Grading, 4 Exact Tutor Categories, Student Feedback Reviews.
 */

(async () => {
  if (!window.store) {
    console.warn('Store not pre-initialized, initializing store...');
  }

  const app = {
    currentTab: 'view-matches',
    activeChatContact: null,
    selectedRating: 5,
    selectedReviewTags: ['NPTEL Verified', 'Super Clear', 'Hands-on Coding'],
    timerInterval: null,
    timerSeconds: 3600,

    // AI Dynamic Mentor Qualification & Skill Assessment Center State
    activeQuiz: null,
    currentQuestionIndex: 0,
    userAnswers: {},
    quizTimerInterval: null,
    quizTimerSeconds: 900,
    assessmentSubjects: [],
    selectedAssessmentSubject: null,
    selectedAssessmentCount: 20,
    selectedAssessmentDifficulty: 'Mixed',
    selectedAssessmentType: 'Complete Mentor Assessment',
    assessmentSearchQuery: '',
    assessmentHistory: [],

    // Multi-Student Live Masterclass & Cohort State
    sessionsFilter: 'UPCOMING',
    activeLiveRoomSessionId: null,

    // Live Audio & Video Media State
    mediaState: {
      isMicMuted: false,
      isCamOff: false,
      isScreenSharing: false,
      previewStream: null,
      liveStream: null
    },
    mediaSettings: {
      audioInput: 'default',
      micVolume: 85,
      noiseSuppression: true,
      echoCancellation: true,
      autoGain: true,
      audioOutput: 'default',
      videoInput: 'default',
      resolution: '1080p',
      virtualBg: 'none',
      mirrorCamera: true,
      lowLightBoost: true
    },

    // Academic Support Desk State
    supportFilter: 'ALL',
    supportSubjectFilter: 'ALL',
    supportSearchQuery: '',
    supportTickets: [],
    knownSupportSubjects: [],
    selectedSupportComplexity: { level: 'Level 1: Syntax / Typo / Quick Debug', bounty: 1.0 },

    // WhatsApp Direct Chat State (Text + Voice Only)
    chatConversations: [],
    chatSearchQuery: '',
    voiceMediaRecorder: null,
    voiceMediaStream: null,
    voiceAudioChunks: [],
    voiceRecordingTimer: null,
    voiceRecordSeconds: 0,
    voicePreviewBlob: null,
    voicePreviewBase64: null,
    voicePreviewDuration: 0,
    voicePreviewAudio: null,
    activeVoicePlayers: {},

    async init() {
      window.app = this;
      try {
        const saved = localStorage.getItem('skillswap_media_settings');
        if (saved) this.mediaSettings = Object.assign(this.mediaSettings, JSON.parse(saved));
      } catch (e) { }

      try {
        await window.store.init();
      } catch (err) {
        console.warn('Store init error, continuing with fallback personas:', err);
      }

      this.bindEvents();
      this.initEntrancePortal();
      this.initChatRealtimeListener();
      this.bindCreateMasterclassEvents();
      this.bindBookingFlowEvents();
      this.setupMasterclassHoverTooltips();

      // Check active authentication session state
      if (!window.store.isSessionActive() || (window.location.hash === '#login' && !window.store.currentUser) || (window.location.hash === '#portal' && !window.store.currentUser)) {
        this.showEntrancePortal();
      } else {
        if (window.location.hash === '#login' || window.location.hash === '#portal') {
          try {
            history.replaceState(null, '', window.location.pathname);
          } catch(e) {}
        }
        this.hideEntrancePortal();
        this.handleInitialRouting(false);
      }

      await this.renderAll();
      this.startSessionTimer();
      this.startSidebarBadgesPolling();
    },

    // ==========================================
    // Event Listeners & Binding
    // ==========================================
    bindEvents() {
      // 1. Sidebar Navigation
      document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.dataset.target;
          if (target) {
            this.switchView(target);
          }
        });
      });

      // Brand Click -> Go to matches
      document.getElementById('brandHomeBtn')?.addEventListener('click', () => {
        this.switchView('view-matches');
      });

      // Quick Swap Banner Button
      document.getElementById('bannerQuickSwapBtn')?.addEventListener('click', async () => {
        const matches = await window.store.getMatchesForCurrentPersona();
        if (matches.length > 0) {
          const topMatch = matches[0].peer;
          const skill = topMatch.skillsOffered[0] || { name: 'UI/UX Design & Figma', rate: 2.5, tier: 'Elite Master' };
          this.openBookingModal(topMatch.id, skill.name, skill.rate || 2.5, skill.tier || 'Elite Master');
        }
      });

      // Credit Pill -> Go to Wallet
      document.getElementById('navCreditPill')?.addEventListener('click', () => {
        this.switchView('view-wallet');
      });

      // 2. Single User Profile Dashboard Dropdown
      const personaBtn = document.getElementById('personaSwitcherBtn');
      const personaDropdown = document.getElementById('personaDropdown');
      personaBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        personaDropdown.classList.toggle('show');
      });

      document.getElementById('dropdownViewProfileBtn')?.addEventListener('click', () => {
        this.switchView('view-profile');
        personaDropdown?.classList.remove('show');
      });

      document.getElementById('dropdownViewWalletBtn')?.addEventListener('click', () => {
        this.switchView('view-wallet');
        personaDropdown?.classList.remove('show');
      });

      document.getElementById('dropdownViewSessionsBtn')?.addEventListener('click', () => {
        this.switchView('view-sessions');
        personaDropdown?.classList.remove('show');
      });

      document.getElementById('dropdownEditProfileBtn')?.addEventListener('click', () => {
        personaDropdown?.classList.remove('show');
        this.openEditProfileModal();
      });

      // Sign Out from dropdown -> returns to Entrance Login Portal
      document.getElementById('dropdownLogoutBtn')?.addEventListener('click', () => {
        personaDropdown?.classList.remove('show');
        window.store.logout();
        this.updateSidebarBadges({ messages: 0, bookSwap: 0, mySessions: 0, support: 0, certificates: 0, assessments: 0, liveRoom: 0 });
        this.showEntrancePortal();
        this.showToast('You have signed out of your dashboard.', 'check');
      });

      // Sign Out from Sidebar Navigation
      document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => {
        window.store.logout();
        this.updateSidebarBadges({ messages: 0, bookSwap: 0, mySessions: 0, support: 0, certificates: 0, assessments: 0, liveRoom: 0 });
        this.showEntrancePortal();
        this.showToast('You have signed out. Welcome to the Login Portal.', 'user');
      });

      // 3. Notifications Dropdown
      const notifBtn = document.getElementById('notifBellBtn');
      const notifDropdown = document.getElementById('notifDropdown');
      notifBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('show');
      });

      document.getElementById('markAllReadBtn')?.addEventListener('click', () => {
        (window.store.notifications || []).forEach(n => n.unread = false);
        this.renderNavbar();
        this.renderNotifications();
        this.showToast('All notifications marked as read', 'check');
      });

      document.addEventListener('click', (e) => {
        if (!personaBtn?.contains(e.target) && !personaDropdown?.contains(e.target)) {
          personaDropdown?.classList.remove('show');
        }
        if (!notifBtn?.contains(e.target) && !notifDropdown?.contains(e.target)) {
          notifDropdown?.classList.remove('show');
        }
        const searchContainer = document.getElementById('navSearchContainer');
        const searchDropdown = document.getElementById('globalSearchResultsDropdown');
        if (!searchContainer?.contains(e.target) && searchDropdown) {
          searchDropdown.style.display = 'none';
        }
        if (!e.target.closest('.session-kebab-btn') && !e.target.closest('.session-dropdown-menu')) {
          document.querySelectorAll('.session-dropdown-menu.show').forEach(m => m.classList.remove('show'));
        }
      });

      // Top 3 Action Button Listeners for My Sessions
      document.getElementById('btnBookSwapSession')?.addEventListener('click', () => this.startBookingFlow());
      document.getElementById('btnCreateMasterclass')?.addEventListener('click', () => this.openCreateMasterclassPage());
      document.getElementById('btnJoinGroupSession')?.addEventListener('click', () => this.switchSessionsTab('GROUPS'));

      window.addEventListener('popstate', (e) => {
        if (e.state?.view === 'masterclass-details' && e.state?.sessionId) {
          this.openMasterclassDetailsPage(e.state.sessionId, false);
          return;
        }
        if (e.state?.view === 'booking' && e.state?.step) {
          this.navigateToBookingStep(e.state.step, false);
          return;
        }
        this.handleInitialRouting(false);
      });

      // Sessions Filter Tab Pills
      document.querySelectorAll('#sessionsFilterPills .session-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const filter = btn.dataset.sessfilter;
          if (filter) this.switchSessionsTab(filter);
        });
      });

      // Masterclass Details Navigation & Modals
      document.getElementById('backToSessionsFromDetailsBtn')?.addEventListener('click', () => {
        this.switchView('view-sessions');
        history.pushState(null, '', '/sessions');
      });

      // Decline Session Request Modal Listeners
      document.getElementById('closeDeclineSessionModalBtn')?.addEventListener('click', () => {
        this.closeModal('declineSessionRequestModal');
        this.restorePageScroll();
      });
      document.getElementById('keepDeclineSessionBtn')?.addEventListener('click', () => {
        this.closeModal('declineSessionRequestModal');
        this.restorePageScroll();
      });
      document.getElementById('confirmDeclineSessionBtn')?.addEventListener('click', () => this.confirmDeclineSession());

      // Finalize Swap Attendance Modal Listeners
      document.getElementById('closeFinalizeSwapModalBtn')?.addEventListener('click', () => {
        this.closeModal('finalizeSwapAttendanceModal');
        this.restorePageScroll();
      });
      document.getElementById('cancelFinalizeSwapBtn')?.addEventListener('click', () => {
        this.closeModal('finalizeSwapAttendanceModal');
        this.restorePageScroll();
      });
      document.getElementById('confirmFinalizeSwapBtn')?.addEventListener('click', () => this.confirmFinalizeSwapAttendance());

      // New Modal Close Buttons
      document.getElementById('closeRescheduleModalBtn')?.addEventListener('click', () => {
        this.closeModal('rescheduleSessionModal');
        this.restorePageScroll();
      });
      document.getElementById('cancelRescheduleBtn')?.addEventListener('click', () => {
        this.closeModal('rescheduleSessionModal');
        this.restorePageScroll();
      });
      document.getElementById('closeCancelSessionModalBtn')?.addEventListener('click', () => {
        this.closeModal('cancelSessionModal');
        this.restorePageScroll();
      });
      document.getElementById('keepSessionBtn')?.addEventListener('click', () => {
        this.closeModal('cancelSessionModal');
        this.restorePageScroll();
      });
      document.getElementById('closeSessionDetailsModalBtn')?.addEventListener('click', () => {
        this.closeModal('sessionDetailsModal');
        this.restorePageScroll();
      });
      document.getElementById('closeSessionDetailsBtn')?.addEventListener('click', () => {
        this.closeModal('sessionDetailsModal');
        this.restorePageScroll();
      });
      document.getElementById('closeSessionFeedbackModalBtn')?.addEventListener('click', () => {
        this.closeModal('sessionFeedbackModal');
        this.restorePageScroll();
      });
      document.getElementById('closeSessionFeedbackBtn')?.addEventListener('click', () => {
        this.closeModal('sessionFeedbackModal');
        this.restorePageScroll();
      });
      document.getElementById('closeSessionCalendarModalBtn')?.addEventListener('click', () => {
        this.closeModal('sessionCalendarModal');
        this.restorePageScroll();
      });
      document.getElementById('closeSessionCalendarBtn')?.addEventListener('click', () => {
        this.closeModal('sessionCalendarModal');
        this.restorePageScroll();
      });

      // Edit Session Modal Listeners
      document.getElementById('closeEditSessionModalBtn')?.addEventListener('click', () => {
        this.closeModal('editSessionModal');
        this.restorePageScroll();
      });
      document.getElementById('cancelEditSessionBtn')?.addEventListener('click', () => {
        this.closeModal('editSessionModal');
        this.restorePageScroll();
      });
      document.getElementById('saveEditSessionBtn')?.addEventListener('click', () => this.saveEditedSession());

      // Report Issue / Dispute Modal Listeners
      document.getElementById('closeReportIssueModalBtn')?.addEventListener('click', () => {
        this.closeModal('reportIssueModal');
        this.restorePageScroll();
      });
      document.getElementById('cancelReportIssueBtn')?.addEventListener('click', () => {
        this.closeModal('reportIssueModal');
        this.restorePageScroll();
      });
      document.getElementById('submitReportIssueBtn')?.addEventListener('click', () => this.submitSessionReport());

      // Reschedule Form Submit Listener
      document.getElementById('rescheduleSessionForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sessionId = document.getElementById('rescheduleSessionId').value;
        const newDate = document.getElementById('rescheduleDateInput').value;
        const newTime = document.getElementById('rescheduleTimeInput').value;

        const btn = document.getElementById('confirmRescheduleBtn');
        const origText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rescheduling...'; btn.disabled = true; }

        try {
          await window.store.rescheduleSession(sessionId, newDate, newTime);
          this.closeModal('rescheduleSessionModal');
          this.restorePageScroll();
          this.showToast(`📅 Session rescheduled to ${newDate} (${newTime})!`, 'calendar-check');
          await this.renderSessions();
        } catch (err) {
          this.restorePageScroll();
          alert('Reschedule failed: ' + err.message);
        } finally {
          this.restorePageScroll();
          if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        }
      });

      // Cancel Form Submit Listener
      document.getElementById('cancelSessionForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sessionId = document.getElementById('cancelSessionId').value;
        const reason = document.getElementById('cancelReasonInput')?.value || '';

        const cats = window.store.categorizedSessions || {};
        const sess = (window.store.sessions || []).find(s => s.id === sessionId) ||
          (cats.all || []).find(s => s.id === sessionId) ||
          (cats.studentPending || []).find(s => s.id === sessionId) ||
          (cats.requests || []).find(s => s.id === sessionId) ||
          (cats.upcoming || []).find(s => s.id === sessionId) ||
          (cats.masterclasses || []).find(s => s.id === sessionId);

        const isCohort = sess?.session_type === 'GROUP_COHORT';
        const isPending = (sess?.status || '').toUpperCase() === 'PENDING';

        const btn = document.getElementById('confirmCancelSessionBtn');
        const origText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cancelling...'; btn.disabled = true; }

        try {
          await window.store.cancelSession(sessionId, reason);
          this.closeModal('cancelSessionModal');
          this.restorePageScroll();

          if (isCohort) {
            this.showToast('Masterclass cancelled successfully.', 'info');
          } else if (isPending) {
            this.showToast('Session request cancelled successfully. Escrow credits refunded to your wallet.', 'info');
          } else {
            this.showToast('Session cancelled. Locked credits have been refunded to wallet.', 'info');
          }

          await window.store.fetchSessions();
          await window.store.fetchMySessions();
          await window.store.fetchWallet();
          this.renderNavbar();
          await this.renderSessions();

          if (this.currentView === 'view-masterclass-details' && this.currentMasterclassId === sessionId) {
            await this.openMasterclassDetailsPage(sessionId, false);
          }
        } catch (err) {
          this.closeModal('cancelSessionModal');
          this.restorePageScroll();
          alert('Cancellation failed: ' + err.message);
        } finally {
          this.restorePageScroll();
          if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        }
      });

      // Modal backdrop click listener (close on clicking dark overlay)
      document.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
          this.closeModal(e.target);
        } else {
          const closeBtn = e.target.closest ? e.target.closest('.modal-close, [data-close-modal]') : null;
          if (closeBtn) {
            const parentModal = closeBtn.closest('.modal-overlay');
            if (parentModal) {
              this.closeModal(parentModal);
            }
          }
        }
      });

      // Escape key listener to dismiss open modals, live search dropdown, persona/notif dropdowns
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.modalStack && this.modalStack.length > 0) {
            this.closeModal();
          } else {
            this.closeAllModals();
          }
          const searchDropdown = document.getElementById('globalSearchResultsDropdown');
          if (searchDropdown) searchDropdown.style.display = 'none';
          document.getElementById('personaDropdown')?.classList.remove('show');
          document.getElementById('notifDropdown')?.classList.remove('show');
        }
      });

      // 4. Supabase Status & Settings Modal
      const supabaseStatusBtn = document.getElementById('supabaseStatusBtn');
      supabaseStatusBtn?.addEventListener('click', () => {
        this.openModal('supabaseModal');
      });
      document.getElementById('closeSupabaseModalBtn')?.addEventListener('click', () => {
        this.closeModal('supabaseModal');
      });
      document.getElementById('cancelSupabaseModalBtn')?.addEventListener('click', () => {
        this.closeModal('supabaseModal');
      });

      const supabaseConfigForm = document.getElementById('supabaseConfigForm');
      supabaseConfigForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = document.getElementById('supabaseUrlInput').value.trim();
        const anonKey = document.getElementById('supabaseKeyInput').value.trim();
        try {
          const res = await fetch('http://localhost:3000/api/database/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, anonKey })
          });
          const data = await res.json();
          if (data.success) {
            const statusEl = document.getElementById('supabaseStatusText');
            if (statusEl) statusEl.textContent = data.isSupabase ? '⚡ Supabase Cloud Connected' : '⚡ Supabase Ready';
            this.closeModal('supabaseModal');
            this.showToast(`Database configuration saved (${data.mode})!`, 'check');
          }
        } catch (err) {
          alert('Could not update Supabase config: ' + err.message);
        }
      });

      // 5. Dark / Light Theme Toggle
      const themeBtn = document.getElementById('themeToggleBtn');
      themeBtn?.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
          document.documentElement.removeAttribute('data-theme');
          document.getElementById('themeIcon').className = 'fa-regular fa-moon';
          localStorage.setItem('skillswap_theme', 'light');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
          document.getElementById('themeIcon').className = 'fa-regular fa-sun';
          localStorage.setItem('skillswap_theme', 'dark');
        }
      });

      if (localStorage.getItem('skillswap_theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        const icon = document.getElementById('themeIcon');
        if (icon) icon.className = 'fa-regular fa-sun';
      }

      // 6. Universal Top Search Engine with Live Dropdown Popup
      const searchInput = document.getElementById('globalSearchInput');
      const searchDropdown = document.getElementById('globalSearchResultsDropdown');
      const searchClearBtn = document.getElementById('globalSearchClearBtn');

      searchInput?.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        this.performGlobalSearch(q);
      });

      searchInput?.addEventListener('focus', (e) => {
        const q = e.target.value.trim();
        if (q.length > 0) {
          this.performGlobalSearch(q);
        }
      });

      searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const q = searchInput.value.trim();
          if (q.length > 0) {
            this.viewAllSearchResults(q);
          }
        } else if (e.key === 'Escape') {
          if (searchDropdown) searchDropdown.style.display = 'none';
        }
      });

      searchClearBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (searchInput) searchInput.value = '';
        if (searchClearBtn) searchClearBtn.style.display = 'none';
        if (searchDropdown) {
          searchDropdown.style.display = 'none';
          searchDropdown.innerHTML = '';
        }
        if (this.currentTab === 'view-explore') {
          const exploreInput = document.getElementById('exploreSearchInput');
          if (exploreInput) exploreInput.value = '';
          this.renderExploreCatalogue('');
        } else if (this.currentTab === 'view-matches') {
          this.renderSmartMatches();
        }
      });

      // 7. Match Filters & Sort
      document.querySelectorAll('[data-match-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('[data-match-filter]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const filter = btn.dataset.matchFilter;
          const sortSel = document.getElementById('matchesSortSelect');
          if (filter === 'credits_asc' && sortSel) sortSel.value = 'credits_asc';
          if (filter === 'credits_desc' && sortSel) sortSel.value = 'credits_desc';
          this.renderSmartMatches(filter);
        });
      });

      document.getElementById('matchesSortSelect')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const activeFilter = document.querySelector('[data-match-filter].active')?.dataset.matchFilter || 'all';
        this.renderSmartMatches(activeFilter);
      });

      // Explore Category Filters
      document.querySelectorAll('[data-cat-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('[data-cat-filter]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.renderExploreCatalogue();
        });
      });

      // Explore Credit Range Filters
      document.querySelectorAll('[data-credit-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('[data-credit-filter]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.renderExploreCatalogue();
        });
      });

      // Explore In-View Search Input
      document.getElementById('exploreSearchInput')?.addEventListener('input', (e) => {
        this.renderExploreCatalogue(e.target.value);
      });

      // Explore Sort (Credits Low-to-High, High-to-Low, Ratings, Tier, Reviews)
      document.getElementById('exploreSortSelect')?.addEventListener('change', () => {
        this.renderExploreCatalogue();
      });

      // 8. Modals & Forms
      this.bindModalEvents();
      this.bindQuizEvents();
      this.bindAuthEvents();
      this.bindSupportEvents();

      // 8b. Session Filter Pills & Host Cohort Triggers
      document.querySelectorAll('#sessionsFilterPills .filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          document.querySelectorAll('#sessionsFilterPills .filter-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.sessionsFilter = pill.dataset.sessfilter || 'ALL';
          this.renderSessions();
        });
      });

      document.getElementById('sessionsHostCohortBtn')?.addEventListener('click', () => {
        this.openHostCohortModal();
      });

      // 9. Live Room Actions
      document.getElementById('completeSessionBtn')?.addEventListener('click', () => {
        const session = (window.store.sessions || []).find(s => s.id === this.activeLiveRoomSessionId) || window.store.sessions[0];
        if (session && session.session_type === 'GROUP_COHORT') {
          const isTutor = session.teacher_id === window.store.getCurrentPersona().id || session.tutor_id === window.store.getCurrentPersona().id;
          if (isTutor) {
            this.concludeCohortSession(session.id);
          } else {
            this.openReviewModal(session.id);
          }
        } else {
          this.openReviewModal(session ? session.id : 'sess_1');
        }
      });

      document.getElementById('sidebarCompleteSessionBtn')?.addEventListener('click', () => {
        const session = (window.store.sessions || []).find(s => s.id === this.activeLiveRoomSessionId) || window.store.sessions[0];
        if (session && session.session_type === 'GROUP_COHORT') {
          const isTutor = session.teacher_id === window.store.getCurrentPersona().id || session.tutor_id === window.store.getCurrentPersona().id;
          if (isTutor) {
            this.concludeCohortSession(session.id);
          } else {
            this.openReviewModal(session.id);
          }
        } else {
          this.openReviewModal(session ? session.id : 'sess_1');
        }
      });

      document.getElementById('enrollLiveRoomCohortBtn')?.addEventListener('click', async () => {
        if (this.activeLiveRoomSessionId) {
          await this.enrollInLiveCohort(this.activeLiveRoomSessionId);
        }
      });

      document.getElementById('sessionsGoLiveBtn')?.addEventListener('click', () => {
        this.switchView('view-room');
      });

      document.getElementById('reportDisputeBtn')?.addEventListener('click', () => {
        alert('Dispute ticket created! Faculty Admin (Dr. S. K. Rao) has been notified to review this session in Supabase.');
      });

      document.getElementById('resetRoomEditorBtn')?.addEventListener('click', () => {
        const editor = document.getElementById('liveRoomCodeEditor');
        if (editor) {
          editor.value = `// Collaborative Multi-Student Workspace\nconsole.log("Ready for live peer coding session!");`;
          this.showToast('Workspace reset', 'rotate');
        }
      });

      // 10. Live Audio & Video Controls (Live Room & 1-on-1 Sessions)
      document.getElementById('roomToggleMicBtn')?.addEventListener('click', () => {
        this.toggleMicrophone();
      });

      document.getElementById('roomToggleCamBtn')?.addEventListener('click', () => {
        this.toggleCamera();
      });

      document.getElementById('roomToggleScreenBtn')?.addEventListener('click', () => {
        this.toggleScreenShare();
      });

      document.getElementById('roomLeaveMeetingBtn')?.addEventListener('click', () => {
        if (window.skillSwapConference) {
          window.skillSwapConference.leaveMeeting();
        } else {
          this.switchView('view-sessions');
        }
      });

      // In-Room Meeting Chat Events
      const sendChatHandler = () => {
        const input = document.getElementById('liveRoomChatInput');
        if (!input || !input.value.trim()) return;
        const msg = input.value.trim();
        input.value = '';
        if (window.skillSwapConference && window.skillSwapConference.isInCall) {
          window.skillSwapConference.sendInMeetingChatMessage(msg);
        } else {
          // Local fallback preview
          const user = window.store?.getCurrentPersona() || { name: 'You' };
          window.skillSwapConference?.appendInMeetingChatMessage(user.name, msg);
        }
      };

      document.getElementById('liveRoomSendChatBtn')?.addEventListener('click', sendChatHandler);
      document.getElementById('liveRoomChatInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendChatHandler();
        }
      });

      document.getElementById('roomMediaSettingsBtn')?.addEventListener('click', () => {
        this.openMediaSettingsModal();
      });

      document.getElementById('roomQuickSpeakerTestBtn')?.addEventListener('click', () => {
        this.playSpeakerTestTone();
      });

      document.getElementById('modalTestSpeakerBtn')?.addEventListener('click', () => {
        this.playSpeakerTestTone();
      });

      document.getElementById('closeMediaSettingsModalBtn')?.addEventListener('click', () => {
        this.closeMediaSettingsModal();
      });

      document.getElementById('closeMediaSettingsBtn')?.addEventListener('click', () => {
        this.closeMediaSettingsModal();
      });

      document.getElementById('saveMediaSettingsBtn')?.addEventListener('click', () => {
        this.saveMediaSettings();
      });

      // AV Modal Tab Switching
      document.getElementById('tabBtnAudio')?.addEventListener('click', () => {
        document.getElementById('tabBtnAudio')?.classList.add('active');
        document.getElementById('tabBtnVideo')?.classList.remove('active');
        const tabAudio = document.getElementById('tabContentAudio');
        const tabVideo = document.getElementById('tabContentVideo');
        if (tabAudio) tabAudio.style.display = 'block';
        if (tabVideo) tabVideo.style.display = 'none';
      });

      document.getElementById('tabBtnVideo')?.addEventListener('click', () => {
        document.getElementById('tabBtnVideo')?.classList.add('active');
        document.getElementById('tabBtnAudio')?.classList.remove('active');
        const tabAudio = document.getElementById('tabContentAudio');
        const tabVideo = document.getElementById('tabContentVideo');
        if (tabAudio) tabAudio.style.display = 'none';
        if (tabVideo) tabVideo.style.display = 'block';
      });

      // Mic Volume Slider
      document.getElementById('micVolumeSlider')?.addEventListener('input', (e) => {
        const val = e.target.value;
        const disp = document.getElementById('micVolumeValueDisplay');
        const meter = document.getElementById('audioLevelMeterBar');
        if (disp) disp.textContent = `${val}%`;
        if (meter) meter.style.width = `${Math.min(100, Math.max(10, val * 0.8))}%`;
      });

      // Start Camera Test in Modal
      document.getElementById('startCamTestBtn')?.addEventListener('click', async () => {
        await this.startCameraPreview();
      });

      // Refresh Profile Isolated Ledger & Quiz Attempts History
      document.getElementById('refreshProfileLedgerBtn')?.addEventListener('click', async () => {
        await this.renderProfile();
        this.showToast('Profile transaction audit log refreshed from database!', 'check');
      });

      document.getElementById('refreshProfileQuizAttemptsBtn')?.addEventListener('click', async () => {
        await this.renderProfile();
        this.showToast('Assessment history records reloaded from database!', 'check');
      });

      // 10. WhatsApp Direct Messaging & Voice Recording Events
      this.bindWhatsAppChatEvents();

      // Certificate Upload Triggers
      document.getElementById('sidebarUploadCertBtn')?.addEventListener('click', () => this.switchView('view-upload-cert'));
      document.getElementById('profileUploadCertBtn')?.addEventListener('click', () => this.switchView('view-upload-cert'));
      document.getElementById('quizUploadCertBtn')?.addEventListener('click', () => this.switchView('view-upload-cert'));
      document.getElementById('profileCertSectionAddBtn')?.addEventListener('click', () => this.switchView('view-upload-cert'));
      document.getElementById('profileVerifyCertCtaBtn')?.addEventListener('click', () => this.switchView('view-upload-cert'));
      this.bindUploadCertPageEvents();

      // Quick Buttons
      document.getElementById('exploreAddSkillBtn')?.addEventListener('click', () => this.openAddSkillModal('offered'));
      document.getElementById('profileAddSkillBtn')?.addEventListener('click', () => this.openAddSkillModal('offered'));
      document.getElementById('profileAddTeachBtn')?.addEventListener('click', () => this.openAddSkillModal('offered'));
      document.getElementById('profileAddLearnBtn')?.addEventListener('click', () => this.openAddSkillModal('wanted'));
      document.getElementById('walletEarnMoreBtn')?.addEventListener('click', () => this.switchView('view-matches'));
    },

    // ==========================================
    // Entrance Login Portal Controller
    // ==========================================
    initEntrancePortal() {
      // 1. Setup Avatar Preset Images for Quick Login Cards
      const sriAvatar = document.getElementById('portalAvatarSri');
      const rishithaAvatar = document.getElementById('portalAvatarRishitha');
      const adminAvatar = document.getElementById('portalAvatarAdmin');

      if (sriAvatar) sriAvatar.src = window.getStudentAvatar('sri');
      if (rishithaAvatar) rishithaAvatar.src = window.getStudentAvatar('rishitha');
      if (adminAvatar) adminAvatar.src = window.getStudentAvatar('admin');

      // 2. Tab Switching (Sign In vs Sign Up)
      const tabSignInBtn = document.getElementById('portalTabSignInBtn');
      const tabSignUpBtn = document.getElementById('portalTabSignUpBtn');
      const signInForm = document.getElementById('portalSignInForm');
      const signUpForm = document.getElementById('portalSignUpForm');

      tabSignInBtn?.addEventListener('click', () => {
        tabSignInBtn.classList.add('active');
        tabSignUpBtn?.classList.remove('active');
        if (signInForm) {
          signInForm.style.display = 'flex';
          signInForm.classList.add('active');
        }
        if (signUpForm) {
          signUpForm.style.display = 'none';
          signUpForm.classList.remove('active');
        }
      });

      tabSignUpBtn?.addEventListener('click', () => {
        tabSignUpBtn.classList.add('active');
        tabSignInBtn?.classList.remove('active');
        if (signUpForm) {
          signUpForm.style.display = 'flex';
          signUpForm.classList.add('active');
        }
        if (signInForm) {
          signInForm.style.display = 'none';
          signInForm.classList.remove('active');
        }
      });

      // 3. Sign In Form Submission
      signInForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('portalLoginEmail');
        const passInput = document.getElementById('portalLoginPassword');
        const errBox = document.getElementById('portalLoginErrorMsg');
        const submitBtn = document.getElementById('portalSubmitSignInBtn');

        if (errBox) errBox.style.display = 'none';

        const email = emailInput?.value?.trim();
        const password = passInput?.value;

        if (!email || !password) {
          if (errBox) {
            errBox.textContent = 'Please provide both email/User ID and password.';
            errBox.style.display = 'block';
          }
          return;
        }

        if (!/^[A-Z]/.test(password)) {
          if (errBox) {
            errBox.textContent = 'Password must start with a Capital Letter (A-Z).';
            errBox.style.display = 'block';
          }
          return;
        }

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Verifying...</span>`;
          }

          const res = await window.store.login(email, password);
          sessionStorage.setItem('skillswap_logged_in', 'true');

          this.hideEntrancePortal();
          await this.renderAll();
          this.showToast(`Welcome back, ${res.user?.name || 'Student'}!`, 'check');
        } catch (err) {
          if (errBox) {
            errBox.textContent = err.message || 'Login failed. Please check credentials.';
            errBox.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Sign In to Dashboard</span> <i class="fa-solid fa-arrow-right"></i>`;
          }
        }
      });

      // 4. Sign Up Form Submission
      signUpForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('portalRegName')?.value?.trim();
        const email = document.getElementById('portalRegEmail')?.value?.trim();
        const password = document.getElementById('portalRegPassword')?.value;
        const major = document.getElementById('portalRegMajor')?.value?.trim();
        const role = document.getElementById('portalRegRole')?.value || 'STUDENT';
        const errBox = document.getElementById('portalRegErrorMsg');
        const submitBtn = document.getElementById('portalSubmitSignUpBtn');

        if (errBox) errBox.style.display = 'none';

        if (!name || !email || !password || !major) {
          if (errBox) {
            errBox.textContent = 'Please fill all required registration fields.';
            errBox.style.display = 'block';
          }
          return;
        }

        if (!/^[A-Z]/.test(password)) {
          if (errBox) {
            errBox.textContent = 'Password must start with a Capital Letter (A-Z).';
            errBox.style.display = 'block';
          }
          return;
        }

        if (password.length < 6) {
          if (errBox) {
            errBox.textContent = 'Password must be at least 6 characters long.';
            errBox.style.display = 'block';
          }
          return;
        }

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Creating account...</span>`;
          }

          const res = await window.store.register({
            name,
            email,
            password,
            major,
            role,
            college: 'Vignan University',
            bio: `Enthusiastic ${role === 'ADMIN' ? 'Platform Administrator' : 'Student & Peer Learner'}`
          });
          sessionStorage.setItem('skillswap_logged_in', 'true');

          this.hideEntrancePortal();
          await this.renderAll();
          this.showToast(`Account created! Welcome, ${res.user?.name || name} (3.0 Cr Granted)!`, 'check');
        } catch (err) {
          if (errBox) {
            errBox.textContent = err.message || 'Registration failed.';
            errBox.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-user-plus"></i> <span>Create Account & Join</span>`;
          }
        }
      });

      // 5. Demo Persona Fast-Login Cards
      document.querySelectorAll('.portal-persona-card').forEach(card => {
        card.addEventListener('click', async () => {
          const personaId = card.getAttribute('data-persona');
          if (!personaId) return;

          try {
            card.style.opacity = '0.7';
            await window.store.switchPersona(personaId);
            sessionStorage.setItem('skillswap_logged_in', 'true');

            this.hideEntrancePortal();
            await this.renderAll();
            const current = window.store.getCurrentPersona();
            this.showToast(`Logged in as ${current?.name || personaId}!`, 'check');
          } catch (err) {
            console.warn('Fast-login note:', err);
            this.hideEntrancePortal();
            await this.renderAll();
          } finally {
            card.style.opacity = '1';
          }
        });
      });
    },

    showEntrancePortal() {
      document.body.classList.add('portal-active');
      const overlay = document.getElementById('entrancePortalOverlay');
      if (overlay) {
        overlay.classList.remove('portal-hidden');
        overlay.style.display = 'flex';
        // Refresh persona avatar SVGs
        const sriAvatar = document.getElementById('portalAvatarSri');
        const rishithaAvatar = document.getElementById('portalAvatarRishitha');
        const adminAvatar = document.getElementById('portalAvatarAdmin');
        if (sriAvatar && window.getStudentAvatar) sriAvatar.src = window.getStudentAvatar('sri');
        if (rishithaAvatar && window.getStudentAvatar) rishithaAvatar.src = window.getStudentAvatar('rishitha');
        if (adminAvatar && window.getStudentAvatar) adminAvatar.src = window.getStudentAvatar('admin');

        // Clear any password inputs
        const pass = document.getElementById('portalLoginPassword');
        if (pass) pass.value = '';
        const regPass = document.getElementById('portalRegPassword');
        if (regPass) regPass.value = '';
        const loginErr = document.getElementById('portalLoginErrorMsg');
        if (loginErr) loginErr.style.display = 'none';
        const regErr = document.getElementById('portalRegErrorMsg');
        if (regErr) regErr.style.display = 'none';
      }
    },

    hideEntrancePortal() {
      document.body.classList.remove('portal-active');
      const overlay = document.getElementById('entrancePortalOverlay');
      if (overlay) {
        overlay.classList.add('portal-hidden');
        setTimeout(() => {
          if (overlay.classList.contains('portal-hidden')) {
            overlay.style.display = 'none';
          }
        }, 450);
      }
    },

    bindModalEvents() {
      // Booking Modal
      const bookingModal = document.getElementById('bookingModal');
      document.getElementById('closeBookingModalBtn')?.addEventListener('click', () => this.closeModal('bookingModal'));
      document.getElementById('cancelBookingBtn')?.addEventListener('click', () => this.closeModal('bookingModal'));

      const durationSelect = document.getElementById('bookDurationSelect');
      durationSelect?.addEventListener('change', () => this.updateBookingCalculation());

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateInput = document.getElementById('bookDateInput');
      if (dateInput) {
        dateInput.value = tomorrow.toISOString().split('T')[0];
        dateInput.min = new Date().toISOString().split('T')[0];
      }

      const bookingForm = document.getElementById('bookingForm');
      bookingForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const teacherId = document.getElementById('bookTeacherId').value;
        const skillName = document.getElementById('bookSkillName').textContent;
        const hours = Number(document.getElementById('bookDurationSelect').value);
        const date = document.getElementById('bookDateInput').value;
        const topic = document.getElementById('bookTopicInput').value;

        try {
          const res = await window.store.bookSession({ teacherId, skillName, hours, date, topic });
          this.closeModal('bookingModal');
          this.renderAll();
          this.showToast(`Session booked! ${res.creditsLocked || (hours * 2.5)} credits locked in Escrow (${res.tier || 'Elite Master'} Tutor).`, 'lock');
          this.switchView('view-sessions');
        } catch (err) {
          alert(err.message);
        }
      });

      // Certificate Upload Modal & NPTEL File Verification
      const certModal = document.getElementById('uploadCertModal');
      document.getElementById('closeUploadCertModalBtn')?.addEventListener('click', () => this.closeModal('uploadCertModal'));
      document.getElementById('cancelUploadCertBtn')?.addEventListener('click', () => this.closeModal('uploadCertModal'));
      document.getElementById('closeCertificateAuditModalBtn')?.addEventListener('click', () => this.closeModal('certificateAuditModal'));
      document.getElementById('closeCertAuditModalFooterBtn')?.addEventListener('click', () => this.closeModal('certificateAuditModal'));

      // NPTEL Certificate File Dropzone Handlers
      const certDropzone = document.getElementById('certFileDropzone');
      const certFileInput = document.getElementById('nptelCertFileInput');
      const certUploadPrompt = document.getElementById('certUploadPrompt');
      const certFilePreviewCard = document.getElementById('certFilePreviewCard');
      const certFileNameDisplay = document.getElementById('certFileNameDisplay');
      const certFileSizeDisplay = document.getElementById('certFileSizeDisplay');
      const certFileIconHolder = document.getElementById('certFileIconHolder');
      const removeCertFileBtn = document.getElementById('removeCertFileBtn');

      if (certDropzone && certFileInput) {
        certDropzone.addEventListener('click', (e) => {
          if (e.target.closest('#removeCertFileBtn')) return;
          certFileInput.click();
        });

        certDropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          certDropzone.classList.add('dragover');
        });

        certDropzone.addEventListener('dragleave', () => {
          certDropzone.classList.remove('dragover');
        });

        certDropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          certDropzone.classList.remove('dragover');
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleCertFileUpload(e.dataTransfer.files[0]);
          }
        });

        certFileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleCertFileUpload(e.target.files[0]);
          }
        });

        const handleCertFileUpload = (file) => {
          const reader = new FileReader();
          reader.onload = (re) => {
            const base64Data = re.target.result;
            this.selectedCertFile = {
              name: file.name,
              size: file.size,
              type: file.type,
              data: base64Data
            };

            if (certUploadPrompt) certUploadPrompt.style.display = 'none';
            if (certFilePreviewCard) certFilePreviewCard.style.display = 'block';
            if (certFileNameDisplay) certFileNameDisplay.textContent = file.name;
            if (certFileSizeDisplay) {
              const kb = (file.size / 1024).toFixed(1);
              certFileSizeDisplay.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${kb} KB • NPTEL / Academic Document Ready for Scan`;
            }
            if (certFileIconHolder) {
              const isPdf = file.name.toLowerCase().endsWith('.pdf');
              certFileIconHolder.innerHTML = isPdf ? '<i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i>' : '<i class="fa-solid fa-file-image" style="color:#6366f1;"></i>';
            }
          };
          reader.readAsDataURL(file);
        };

        if (removeCertFileBtn) {
          removeCertFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectedCertFile = null;
            certFileInput.value = '';
            if (certFilePreviewCard) certFilePreviewCard.style.display = 'none';
            if (certUploadPrompt) certUploadPrompt.style.display = 'block';
          });
        }
      }

      // Dynamic Custom Course / Skill Name Selector Toggle
      const certSkillSelect = document.getElementById('certSkillSelect');
      const certCustomSkillGroup = document.getElementById('certCustomSkillGroup');
      const certCustomSkillInput = document.getElementById('certCustomSkillInput');

      if (certSkillSelect) {
        certSkillSelect.addEventListener('change', (e) => {
          if (e.target.value === 'custom') {
            if (certCustomSkillGroup) certCustomSkillGroup.style.display = 'block';
            if (certCustomSkillInput) {
              certCustomSkillInput.focus();
              certCustomSkillInput.required = true;
            }
          } else {
            if (certCustomSkillGroup) certCustomSkillGroup.style.display = 'none';
            if (certCustomSkillInput) {
              certCustomSkillInput.required = false;
            }
          }
        });
      }

      // Demo Quick-Fill Buttons for Instant Original vs Fake Testing
      document.getElementById('btnFillOriginalCert')?.addEventListener('click', () => {
        document.getElementById('certSkillSelect').value = 'Python Core & OOP';
        if (certCustomSkillGroup) certCustomSkillGroup.style.display = 'none';
        if (certCustomSkillInput) { certCustomSkillInput.value = ''; certCustomSkillInput.required = false; }
        document.getElementById('certAuthoritySelect').value = 'NPTEL (IIT Madras / Kharagpur)';
        document.getElementById('certGradeInput').value = 'Elite + Gold (94%)';
        document.getElementById('certTitleInput').value = 'Programming, Data Structures and Algorithms using Python';
        document.getElementById('certIdInput').value = 'NPTEL24CS98S1245' + Math.floor(1000 + Math.random() * 9000);

        this.selectedCertFile = {
          name: 'NPTEL24CS98S_IIT_Madras_Official_Cert.pdf',
          size: 345200,
          type: 'application/pdf',
          data: 'data:application/pdf;base64,NPTEL_IIT_MADRAS_OFFICIAL_SEAL_WATERMARK_SIGNATURE'
        };

        const certUploadPrompt = document.getElementById('certUploadPrompt');
        const certFilePreviewCard = document.getElementById('certFilePreviewCard');
        const certFileNameDisplay = document.getElementById('certFileNameDisplay');
        const certFileSizeDisplay = document.getElementById('certFileSizeDisplay');
        const certFileIconHolder = document.getElementById('certFileIconHolder');
        const alertBox = document.getElementById('certVerificationModalAlert');

        if (alertBox) alertBox.style.display = 'none';
        if (certUploadPrompt) certUploadPrompt.style.display = 'none';
        if (certFilePreviewCard) certFilePreviewCard.style.display = 'block';
        if (certFileNameDisplay) certFileNameDisplay.textContent = 'NPTEL24CS98S_IIT_Madras_Official_Cert.pdf';
        if (certFileSizeDisplay) certFileSizeDisplay.innerHTML = '<i class="fa-solid fa-circle-check"></i> 337.1 KB • Authentic NPTEL PDF with IIT Seal & QR Watermark';
        if (certFileIconHolder) certFileIconHolder.innerHTML = '<i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i>';

        this.showToast('Loaded Authentic Original NPTEL Certificate Data (Ready to Verify)', 'check');
      });

      document.getElementById('btnFillFakeCert')?.addEventListener('click', () => {
        document.getElementById('certSkillSelect').value = 'Machine Learning Basics';
        if (certCustomSkillGroup) certCustomSkillGroup.style.display = 'none';
        if (certCustomSkillInput) { certCustomSkillInput.value = ''; certCustomSkillInput.required = false; }
        document.getElementById('certAuthoritySelect').value = 'NPTEL (IIT Madras / Kharagpur)';
        document.getElementById('certGradeInput').value = '35% (Below Passing Mark)';
        document.getElementById('certTitleInput').value = 'Machine Learning Dummy / Fake Certificate';
        document.getElementById('certIdInput').value = 'FAKE_TEST_INVALID_999';

        this.selectedCertFile = {
          name: 'fake_test_document.txt',
          size: 1240,
          type: 'text/plain',
          data: 'data:text/plain;base64,FAKE_INVALID_FILE'
        };

        const certUploadPrompt = document.getElementById('certUploadPrompt');
        const certFilePreviewCard = document.getElementById('certFilePreviewCard');
        const certFileNameDisplay = document.getElementById('certFileNameDisplay');
        const certFileSizeDisplay = document.getElementById('certFileSizeDisplay');
        const certFileIconHolder = document.getElementById('certFileIconHolder');
        const alertBox = document.getElementById('certVerificationModalAlert');
        const reportContainer = document.getElementById('certAiReportContainer');

        if (alertBox) alertBox.style.display = 'none';
        if (reportContainer) reportContainer.style.display = 'none';
        if (certUploadPrompt) certUploadPrompt.style.display = 'none';
        if (certFilePreviewCard) certFilePreviewCard.style.display = 'block';
        if (certFileNameDisplay) certFileNameDisplay.textContent = 'fake_test_document.txt';
        if (certFileSizeDisplay) certFileSizeDisplay.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i> 1.2 KB • Fake Unrecognized Document (Will Be Rejected)';
        if (certFileIconHolder) certFileIconHolder.innerHTML = '<i class="fa-solid fa-file-excel" style="color:#ef4444;"></i>';

        this.showToast('Loaded Fake Sample Data (Click Submit to Test Rejection)', 'lock');
      });

      document.getElementById('btnFillManualCert')?.addEventListener('click', () => {
        document.getElementById('certSkillSelect').value = 'UI/UX Design & Figma';
        if (certCustomSkillGroup) certCustomSkillGroup.style.display = 'none';
        if (certCustomSkillInput) { certCustomSkillInput.value = ''; certCustomSkillInput.required = false; }
        document.getElementById('certAuthoritySelect').value = 'Other / Third-Party Academy';
        document.getElementById('certGradeInput').value = 'Grade A (88%)';
        document.getElementById('certTitleInput').value = 'Advanced UI/UX Design & Figma Certificate';
        document.getElementById('certIdInput').value = 'TAC-2024-UX9988';

        this.selectedCertFile = {
          name: 'techacademy_design_cert.png',
          size: 215400,
          type: 'image/png',
          data: 'data:image/png;base64,THIRD_PARTY_ACADEMY_UNVERIFIED_CERT_PAYLOAD'
        };

        const certUploadPrompt = document.getElementById('certUploadPrompt');
        const certFilePreviewCard = document.getElementById('certFilePreviewCard');
        const certFileNameDisplay = document.getElementById('certFileNameDisplay');
        const certFileSizeDisplay = document.getElementById('certFileSizeDisplay');
        const certFileIconHolder = document.getElementById('certFileIconHolder');
        const alertBox = document.getElementById('certVerificationModalAlert');
        const reportContainer = document.getElementById('certAiReportContainer');

        if (alertBox) alertBox.style.display = 'none';
        if (reportContainer) reportContainer.style.display = 'none';
        if (certUploadPrompt) certUploadPrompt.style.display = 'none';
        if (certFilePreviewCard) certFilePreviewCard.style.display = 'block';
        if (certFileNameDisplay) certFileNameDisplay.textContent = 'techacademy_design_cert.png';
        if (certFileSizeDisplay) certFileSizeDisplay.innerHTML = '<i class="fa-solid fa-user-clock" style="color:#f59e0b;"></i> 210.4 KB • Third-Party Unaccredited Academy (Queues Manual Review)';
        if (certFileIconHolder) certFileIconHolder.innerHTML = '<i class="fa-solid fa-file-image" style="color:#f59e0b;"></i>';

        this.showToast('Loaded Third-Party Academy Sample Data (Triggers Manual Review)', 'user');
      });

      const certForm = document.getElementById('uploadCertForm');
      certForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectVal = document.getElementById('certSkillSelect').value;
        const customSkillVal = document.getElementById('certCustomSkillInput')?.value.trim();
        const skillName = (selectVal === 'custom' && customSkillVal)
          ? customSkillVal
          : (selectVal === 'custom' ? (document.getElementById('certTitleInput')?.value.trim() || 'Custom Skill Course') : (selectVal || 'Python Core & OOP'));
        const authority = document.getElementById('certAuthoritySelect').value;
        const scoreOrGrade = document.getElementById('certGradeInput').value.trim();
        const title = document.getElementById('certTitleInput').value.trim() || `${skillName} Certification`;
        const credentialId = document.getElementById('certIdInput').value.trim();
        const alertBox = document.getElementById('certVerificationModalAlert');
        const reportContainer = document.getElementById('certAiReportContainer');
        const scanProgress = document.getElementById('certAiScanProgress');
        const scanPercent = document.getElementById('certAiScanPercent');
        const scanProgressBar = document.getElementById('certAiScanProgressBar');
        const scanStepStatus = document.getElementById('certAiScanStepStatus');
        const submitBtn = document.getElementById('submitUploadCertBtn');
        const origSubmitText = submitBtn ? submitBtn.innerHTML : '';

        if (alertBox) alertBox.style.display = 'none';
        if (reportContainer) reportContainer.style.display = 'none';

        // Animated Multi-Stage AI Scanning Sequence
        if (scanProgress) scanProgress.style.display = 'block';
        if (submitBtn) {
          submitBtn.innerHTML = '<i class="fa-solid fa-robot fa-spin"></i> Analyzing Certificate Authenticity...';
          submitBtn.disabled = true;
        }

        const updateScan = (pct, text) => {
          if (scanPercent) scanPercent.textContent = `${pct}%`;
          if (scanProgressBar) scanProgressBar.style.width = `${pct}%`;
          if (scanStepStatus) scanStepStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size: 0.75rem;"></i> ${text}`;
        };

        updateScan(25, 'Step 1/4: Extracting certificate information, recipient & credential ID...');
        await new Promise(r => setTimeout(r, 220));

        updateScan(50, 'Step 2/4: Inspecting visual authenticity, logos, watermark & seal consistency...');
        await new Promise(r => setTimeout(r, 220));

        updateScan(75, 'Step 3/4: Validating issuer registry accreditation & domain verification links...');
        await new Promise(r => setTimeout(r, 220));

        updateScan(95, 'Step 4/4: Cross-evaluating multi-vector consistency & synthesizing final decision...');

        try {
          const current = window.store.getCurrentPersona();
          const token = localStorage.getItem('token') || (window.store.token || '');
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          if (current?.id) headers['x-user-id'] = current.id;

          const res = await fetch('http://localhost:3000/api/certificates/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              userId: current.id,
              recipientName: current.name || 'Sri Dhanush',
              skillName,
              authority,
              issuer: authority,
              title,
              credentialId,
              scoreOrGrade,
              fileName: this.selectedCertFile?.name || (credentialId ? `${credentialId}_cert.pdf` : ''),
              fileData: this.selectedCertFile?.data || ''
            })
          });
          const data = await res.json();

          if (scanProgress) scanProgress.style.display = 'none';
          if (submitBtn) {
            submitBtn.innerHTML = origSubmitText;
            submitBtn.disabled = false;
          }

          const aiReport = data.aiReport || {
            result: data.result || (data.success ? 'REAL' : 'FAKE'),
            confidence: data.result === 'REAL' ? 99 : 92,
            recipient_name: current.name || 'Sri Dhanush',
            certificate_id: credentialId,
            course: title,
            issuer: authority,
            issue_date: 'Academic Year 2023-2024',
            verification_url: `https://nptel.ac.in/noc/Ecertificate/?q=${credentialId}`,
            checks_performed: [
              "Extract recipient's name, course name, issuing organization, certificate ID, issue date, and authentication elements",
              "Analyze visual layout consistency, detect signs of editing, manipulation, inconsistent fonts, spacing, alignment, and image artifacts",
              "Identify issuing organization, verify institutional legitimacy, and check against official certificate-verification portals",
              "Detect and read QR code / verification link, verify URL points to legitimate official issuer domain, and confirm ID match",
              "Compare extracted fields to identify contradictions across names, certificate IDs, dates, course titles, and signatures",
              "Inspect issuer's logo, branding, official seal, and digital signatures against authentic security templates",
              "Synthesize multi-vector verification criteria and determine final classification (REAL / FAKE / NEEDS MANUAL VERIFICATION)"
            ],
            evidence: data.success ? ['Issuing institution recognized and authenticated', 'Official digital security seal verified'] : [],
            suspicious_elements: !data.success ? [data.error || 'Verification Failed'] : [],
            reason: data.message || data.error || 'AI verification completed.'
          };

          // Render comprehensive AI Report Card
          this.renderCertificateAiReport(aiReport, reportContainer);

          if (!data.success || aiReport.result === 'FAKE' || data.status === 'NOT_VERIFIED') {
            if (alertBox) {
              alertBox.className = 'cert-verification-alert error';
              alertBox.style.display = 'flex';
              alertBox.innerHTML = `
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.35rem; margin-top: 2px;"></i>
                <div>
                  <strong>❌ Verification Result: NOT VERIFIED (REJECTED)</strong>
                  <div style="margin-top: 0.25rem;">${aiReport.reason || data.error || 'The certificate was detected as forged, invalid, or unverified. Tutor access denied.'}</div>
                </div>
              `;
            }
            this.showToast(`❌ Verification Result: NOT VERIFIED. Upload rejected (0 Credits).`, 'lock');
            if (window.store?.fetchCertificates) await window.store.fetchCertificates(current.id);
            await window.store.init();
            this.renderAll();
            this.loadCertificateStatusUI();
            return;
          }

          if (aiReport.result === 'NEEDS MANUAL VERIFICATION' || data.status === 'NEEDS_MANUAL_REVIEW') {
            this.showToast(`⚠️ Verification Result: NEEDS MANUAL REVIEW. Queued for Faculty Audit.`, 'user');
            await window.store.init();
            this.renderAll();
            this.loadCertificateStatusUI();
            return;
          }

          // Case: VERIFIED
          this.showToast(`🎉 Certificate VERIFIED! You are now an authorized Tutor! +${data.bonusCredits || 2.0} Credits deposited!`, 'award');

          await window.store.init();
          this.renderAll();
          this.loadCertificateStatusUI();

        } catch (err) {
          if (scanProgress) scanProgress.style.display = 'none';
          if (submitBtn) {
            submitBtn.innerHTML = origSubmitText;
            submitBtn.disabled = false;
          }
          if (alertBox) {
            alertBox.className = 'cert-verification-alert error';
            alertBox.style.display = 'flex';
            alertBox.innerHTML = `
              <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.35rem; margin-top: 2px;"></i>
              <div>
                <strong>❌ Connection Error:</strong>
                <div style="margin-top: 0.25rem;">${err.message}</div>
              </div>
            `;
          }
          alert('Could not upload certificate: ' + err.message);
        }
      });
    },

    // ==========================================
    // AI Verification Report Card Renderer
    // ==========================================
    renderCertificateAiReport(aiReport, container) {
      if (!container || !aiReport) return;

      const isReal = aiReport.result === 'REAL';
      const isFake = aiReport.result === 'FAKE';
      const isManual = aiReport.result === 'NEEDS MANUAL VERIFICATION';

      const statusColor = isReal ? '#10b981' : isFake ? '#ef4444' : '#f59e0b';
      const statusBg = isReal ? 'rgba(16, 185, 129, 0.08)' : isFake ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)';
      const statusBorder = isReal ? 'rgba(16, 185, 129, 0.35)' : isFake ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.35)';

      const badgeHtml = isReal
        ? `<span style="background: #10b981; color: #fff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i class="fa-solid fa-shield-check"></i> REAL (VERIFIED)</span>`
        : isFake
          ? `<span style="background: #ef4444; color: #fff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i class="fa-solid fa-triangle-exclamation"></i> FAKE (REJECTED)</span>`
          : `<span style="background: #f59e0b; color: #fff; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;"><i class="fa-solid fa-user-clock"></i> NEEDS MANUAL VERIFICATION</span>`;

      const confScore = parseInt(aiReport.confidence, 10) || (isReal ? 99 : isFake ? 92 : 65);
      const jsonString = JSON.stringify(aiReport, null, 2);

      container.innerHTML = `
        <div style="background: ${statusBg}; border: 1.5px solid ${statusBorder}; border-radius: var(--radius-lg); padding: 1.15rem; box-shadow: 0 4px 18px rgba(0,0,0,0.06);">
          <!-- Top Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.6rem; border-bottom: 1px solid ${statusBorder}; padding-bottom: 0.75rem; margin-bottom: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div style="width: 38px; height: 38px; border-radius: 50%; background: ${statusColor}22; display: flex; align-items: center; justify-content: center; color: ${statusColor}; font-size: 1.25rem;">
                <i class="fa-solid ${isReal ? 'fa-shield-check' : isFake ? 'fa-triangle-exclamation' : 'fa-clipboard-question'}"></i>
              </div>
              <div>
                <h4 style="margin: 0; font-size: 1rem; font-weight: 800; color: var(--text-primary);">AI Certificate Verification Report</h4>
                <div style="font-size: 0.74rem; color: var(--text-secondary);">7-Stage Multi-Vector Authenticity & Accreditation Analysis</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              ${badgeHtml}
            </div>
          </div>

          <!-- Confidence Meter -->
          <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.65rem 0.85rem; margin-bottom: 0.85rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; font-size: 0.78rem;">
              <span style="font-weight: 700; color: var(--text-secondary);">Classification Confidence:</span>
              <span style="font-weight: 800; color: ${statusColor}; font-size: 0.9rem;">${confScore}%</span>
            </div>
            <div style="background: rgba(255,255,255,0.08); height: 7px; border-radius: 4px; overflow: hidden;">
              <div style="width: ${confScore}%; height: 100%; background: ${statusColor}; transition: width 0.4s ease;"></div>
            </div>
          </div>

          <!-- Extracted Details Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.85rem;">
            <div style="background: var(--bg-card); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 0.76rem;">
              <span style="color: var(--text-muted); display: block; font-size: 0.7rem; text-transform: uppercase; font-weight: 700;">Recipient Name</span>
              <strong style="color: var(--text-primary);">${aiReport.recipient_name || 'N/A'}</strong>
            </div>
            <div style="background: var(--bg-card); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 0.76rem;">
              <span style="color: var(--text-muted); display: block; font-size: 0.7rem; text-transform: uppercase; font-weight: 700;">Issuing Institution</span>
              <strong style="color: var(--text-primary);">${aiReport.issuer || 'N/A'}</strong>
            </div>
            <div style="background: var(--bg-card); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 0.76rem;">
              <span style="color: var(--text-muted); display: block; font-size: 0.7rem; text-transform: uppercase; font-weight: 700;">Certificate ID</span>
              <strong style="color: var(--text-primary); font-family: monospace;">${aiReport.certificate_id || 'N/A'}</strong>
            </div>
            <div style="background: var(--bg-card); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 0.76rem;">
              <span style="color: var(--text-muted); display: block; font-size: 0.7rem; text-transform: uppercase; font-weight: 700;">Course / Skill</span>
              <strong style="color: var(--text-primary);">${aiReport.course || 'N/A'}</strong>
            </div>
          </div>

          <!-- Verification Link & Date -->
          <div style="background: var(--bg-card); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 0.74rem; margin-bottom: 0.85rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <span style="color: var(--text-muted);">Issue Date:</span>
              <strong style="color: var(--text-primary); margin-left: 0.35rem;">${aiReport.issue_date || 'N/A'}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted);">Verification URL:</span>
              <a href="${aiReport.verification_url || '#'}" target="_blank" style="color: var(--primary); font-weight: 700; margin-left: 0.35rem; word-break: break-all;">
                <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem;"></i> Open Registry
              </a>
            </div>
          </div>

          <!-- Evidence List -->
          ${aiReport.evidence && aiReport.evidence.length > 0 ? `
            <div style="margin-bottom: 0.75rem;">
              <div style="font-size: 0.76rem; font-weight: 700; color: #10b981; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.35rem;">
                <i class="fa-solid fa-circle-check"></i> Authenticated Evidence:
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                ${aiReport.evidence.map(ev => `
                  <div style="font-size: 0.74rem; color: var(--text-secondary); display: flex; align-items: flex-start; gap: 0.4rem;">
                    <i class="fa-solid fa-check" style="color: #10b981; font-size: 0.7rem; margin-top: 3px;"></i>
                    <span>${ev}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Suspicious Elements List -->
          ${aiReport.suspicious_elements && aiReport.suspicious_elements.length > 0 ? `
            <div style="margin-bottom: 0.75rem; background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);">
              <div style="font-size: 0.76rem; font-weight: 700; color: #ef4444; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.35rem;">
                <i class="fa-solid fa-triangle-exclamation"></i> Suspicious / Flagged Elements:
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                ${aiReport.suspicious_elements.map(susp => `
                  <div style="font-size: 0.74rem; color: #dc2626; display: flex; align-items: flex-start; gap: 0.4rem;">
                    <i class="fa-solid fa-xmark" style="color: #ef4444; font-size: 0.7rem; margin-top: 3px;"></i>
                    <span>${susp}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Decision Summary -->
          <div style="background: var(--bg-card); border-left: 3px solid ${statusColor}; padding: 0.6rem 0.85rem; border-radius: var(--radius-sm); font-size: 0.76rem; color: var(--text-secondary); line-height: 1.45; margin-bottom: 0.85rem;">
            <strong style="color: var(--text-primary); display: block; margin-bottom: 0.15rem;">Reason for Classification:</strong>
            ${aiReport.reason}
          </div>

          <!-- Structured JSON Output Inspector Accordion -->
          <div style="border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
            <button type="button" class="btn btn-secondary btn-sm" id="btnToggleCertRawJson" style="font-size: 0.72rem; padding: 0.25rem 0.65rem; width: 100%; justify-content: space-between; display: flex;" onclick="
              const codeBlock = document.getElementById('certRawJsonBlock');
              if (codeBlock) {
                const isHidden = codeBlock.style.display === 'none';
                codeBlock.style.display = isHidden ? 'block' : 'none';
                this.innerHTML = isHidden 
                  ? '<span><i class=\\\'fa-solid fa-code\\\'></i> Hide Structured JSON Specification</span> <i class=\\\'fa-solid fa-chevron-up\\\'></i>'
                  : '<span><i class=\\\'fa-solid fa-code\\\'></i> View Structured JSON Specification</span> <i class=\\\'fa-solid fa-chevron-down\\\'></i>';
              }
            ">
              <span><i class="fa-solid fa-code"></i> View Structured JSON Specification</span>
              <i class="fa-solid fa-chevron-down"></i>
            </button>
            <div id="certRawJsonBlock" style="display: none; margin-top: 0.5rem;">
              <pre style="background: #0f172a; color: #38bdf8; padding: 0.75rem 1rem; border-radius: var(--radius-md); font-size: 0.72rem; line-height: 1.4; max-height: 220px; overflow: auto; border: 1px solid rgba(56, 189, 248, 0.25); font-family: monospace;">${jsonString}</pre>
            </div>
          </div>
        </div>
      `;

      container.style.display = 'block';
    },

    bindOtherEvents() {
      const reviewModal = document.getElementById('reviewModal');
      document.getElementById('closeReviewModalBtn')?.addEventListener('click', () => this.closeModal('reviewModal'));
      document.getElementById('skipReviewBtn')?.addEventListener('click', async () => {
        const sessId = document.getElementById('reviewSessionId').value;
        await this.submitSessionCompletion(sessId, 5, '', []);
      });

      document.querySelectorAll('#starRatingGroup .star-btn').forEach(star => {
        star.addEventListener('click', () => {
          const val = Number(star.dataset.val);
          this.selectedRating = val;
          this.updateStarRatingUI(val);
        });
      });

      document.querySelectorAll('#reviewTagsGroup .filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          pill.classList.toggle('active');
          const tag = pill.dataset.tag;
          if (pill.classList.contains('active')) {
            if (!this.selectedReviewTags.includes(tag)) this.selectedReviewTags.push(tag);
          } else {
            this.selectedReviewTags = this.selectedReviewTags.filter(t => t !== tag);
          }
        });
      });

      const reviewForm = document.getElementById('reviewForm');
      reviewForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sessId = document.getElementById('reviewSessionId').value;
        const comment = document.getElementById('reviewCommentInput').value.trim();
        await this.submitSessionCompletion(sessId, this.selectedRating, comment, this.selectedReviewTags);
      });

      // Add Skill Modal
      const addSkillModal = document.getElementById('addSkillModal');
      document.getElementById('closeAddSkillModalBtn')?.addEventListener('click', () => this.closeModal('addSkillModal'));
      document.getElementById('cancelAddSkillBtn')?.addEventListener('click', () => this.closeModal('addSkillModal'));

      const addSkillForm = document.getElementById('addSkillForm');
      addSkillForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.submitAddSkillForm();
      });

      // Host Group Cohort Modal Bindings
      const hostCohortModal = document.getElementById('hostCohortModal');
      document.getElementById('closeHostCohortModalBtn')?.addEventListener('click', () => this.closeModal('hostCohortModal'));
      document.getElementById('cancelHostCohortBtn')?.addEventListener('click', () => this.closeModal('hostCohortModal'));

      document.getElementById('cohortSkillSelect')?.addEventListener('change', () => this.updateCohortEarningsCalculation());
      document.getElementById('cohortDurationSelect')?.addEventListener('change', () => this.updateCohortEarningsCalculation());
      document.getElementById('cohortCapacitySelect')?.addEventListener('change', () => this.updateCohortEarningsCalculation());

      const hostCohortForm = document.getElementById('hostCohortForm');
      hostCohortForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const skillName = document.getElementById('cohortSkillSelect').value;
        const topic = document.getElementById('cohortTopicInput').value.trim();
        const hours = Number(document.getElementById('cohortDurationSelect').value || 2);
        const maxCapacity = Number(document.getElementById('cohortCapacitySelect').value || 5);
        const date = document.getElementById('cohortDateInput').value;
        const time = document.getElementById('cohortTimeInput').value;

        const submitBtn = document.getElementById('submitHostCohortBtn');
        const origText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Launching Masterclass...';
          submitBtn.disabled = true;
        }

        try {
          const res = await window.store.createGroupCohort({
            skillName,
            topic,
            hours,
            date,
            time,
            maxCapacity
          });

          if (submitBtn) {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
          }

          this.closeModal('hostCohortModal');
          hostCohortForm.reset();
          await window.store.fetchSessions();
          await this.renderSessions();
          this.showToast(`🚀 Live Group Masterclass scheduled! Capacity: ${maxCapacity} students (Earn up to ${(maxCapacity * hours * (res.rate || 2.5)).toFixed(1)} Credits).`, 'coins');
          this.switchView('view-sessions');
        } catch (err) {
          if (submitBtn) {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
          }
          alert('Could not launch group masterclass: ' + err.message);
        }
      });

      // Edit User Profile Database Details Modal
      document.getElementById('profileEditDbDetailsBtn')?.addEventListener('click', () => this.openEditProfileModal());
      document.getElementById('closeEditProfileModalBtn')?.addEventListener('click', () => this.closeModal('editProfileModal'));
      document.getElementById('cancelEditProfileBtn')?.addEventListener('click', () => this.closeModal('editProfileModal'));

      const editProfileForm = document.getElementById('editProfileForm');
      editProfileForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('editUserIdHidden')?.value || window.store.getCurrentPersona().id;
        const name = document.getElementById('editUserNameInput')?.value.trim();
        const email = document.getElementById('editUserEmailInput')?.value.trim();
        const college = document.getElementById('editUserCollegeInput')?.value.trim();
        const major = document.getElementById('editUserMajorInput')?.value.trim();
        const role = document.getElementById('editUserRoleSelect')?.value;
        const avatar = document.getElementById('editUserAvatarSelect')?.value;
        const bio = document.getElementById('editUserBioInput')?.value.trim();
        const password = document.getElementById('editUserPasswordInput')?.value.trim();
        if (password) {
          if (!/^[A-Z]/.test(password)) {
            alert('Password rule violation: Password must start with a capital letter (A-Z).');
            this.showToast('❌ Password must start with a capital letter (A-Z).', 'lock');
            return;
          }
          if (password.length < 6) {
            alert('Password rule violation: Password must be at least 6 characters long.');
            this.showToast('❌ Password must be at least 6 characters long.', 'lock');
            return;
          }
        }

        const saveBtn = document.getElementById('saveProfileToDbBtn');
        const origBtnHtml = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) {
          saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving to Database...';
          saveBtn.disabled = true;
        }

        try {
          const payload = { id: userId, name, email, college, major, role, avatar, bio };
          if (password) payload.password = password;

          await window.store.updateUserProfile(payload);
          this.closeModal('editProfileModal');
          if (saveBtn) {
            saveBtn.innerHTML = origBtnHtml;
            saveBtn.disabled = false;
          }
          await window.store.init();
          this.renderAll();
          this.showToast(`✅ Profile details for "${name}" stored & saved in database successfully!`, 'check');
        } catch (err) {
          if (saveBtn) {
            saveBtn.innerHTML = origBtnHtml;
            saveBtn.disabled = false;
          }
          alert('Could not update user details in database: ' + err.message);
        }
      });
    },

    openEditProfileModal() {
      const user = window.store.getCurrentPersona();
      const idHidden = document.getElementById('editUserIdHidden');
      const nameInput = document.getElementById('editUserNameInput');
      const emailInput = document.getElementById('editUserEmailInput');
      const collegeInput = document.getElementById('editUserCollegeInput');
      const majorInput = document.getElementById('editUserMajorInput');
      const roleSelect = document.getElementById('editUserRoleSelect');
      const avatarSelect = document.getElementById('editUserAvatarSelect');
      const bioInput = document.getElementById('editUserBioInput');
      const passwordInput = document.getElementById('editUserPasswordInput');

      if (idHidden) idHidden.value = user.id;
      if (nameInput) nameInput.value = user.name || '';
      if (emailInput) emailInput.value = user.email || '';
      if (collegeInput) collegeInput.value = user.college || 'Vignan University';
      if (majorInput) majorInput.value = user.major || '';
      if (roleSelect) roleSelect.value = (user.role === 'ADMIN' || user.isAdmin) ? 'ADMIN' : 'STUDENT';
      if (avatarSelect) avatarSelect.value = user.avatar || user.id || 'sri';
      if (bioInput) bioInput.value = user.bio || '';
      if (passwordInput) passwordInput.value = '';

      this.openModal('editProfileModal');
    },

    openUploadCertModal() {
      this.switchView('view-upload-cert');
    },

    bindUploadCertPageEvents() {
      // Platform Card Radio Selection (NPTEL vs Other)
      const nptelCard = document.getElementById('platformCardNptel');
      const otherCard = document.getElementById('platformCardOther');
      const nptelRadio = nptelCard?.querySelector('input[type="radio"]');
      const otherRadio = otherCard?.querySelector('input[type="radio"]');

      const selectPlatform = (platform) => {
        if (platform === 'NPTEL') {
          if (nptelRadio) nptelRadio.checked = true;
          if (nptelCard) {
            nptelCard.style.border = '2px solid #2563eb';
            nptelCard.style.background = 'rgba(37, 99, 235, 0.05)';
            nptelCard.classList.add('active');
          }
          if (otherCard) {
            otherCard.style.border = '1px solid var(--border-subtle)';
            otherCard.style.background = 'var(--bg-card)';
            otherCard.classList.remove('active');
          }
        } else {
          if (otherRadio) otherRadio.checked = true;
          if (otherCard) {
            otherCard.style.border = '2px solid #2563eb';
            otherCard.style.background = 'rgba(37, 99, 235, 0.05)';
            otherCard.classList.add('active');
          }
          if (nptelCard) {
            nptelCard.style.border = '1px solid var(--border-subtle)';
            nptelCard.style.background = 'var(--bg-card)';
            nptelCard.classList.remove('active');
          }
        }
      };

      nptelCard?.addEventListener('click', () => selectPlatform('NPTEL'));
      otherCard?.addEventListener('click', () => selectPlatform('Other'));

      // File Dropzone & Pickers
      const dropzone = document.getElementById('pageCertDropzone');
      const fileInput = document.getElementById('pageCertFileInput');
      const chooseBtn = document.getElementById('pageCertChooseBtn');
      const removeFileBtn = document.getElementById('pageCertRemoveFileBtn');

      if (dropzone && fileInput) {
        dropzone.addEventListener('click', (e) => {
          if (e.target.closest('#pageCertRemoveFileBtn')) return;
          fileInput.click();
        });

        chooseBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          fileInput.click();
        });

        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = '#2563eb';
          dropzone.style.background = 'rgba(37, 99, 235, 0.05)';
        });

        dropzone.addEventListener('dragleave', () => {
          dropzone.style.borderColor = '#cbd5e1';
          dropzone.style.background = 'var(--bg-subtle)';
        });

        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = '#cbd5e1';
          dropzone.style.background = 'var(--bg-subtle)';
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
          }
        });

        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
          }
        });

        const handleFileSelect = (file) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            this.selectedUploadCertPageFile = {
              name: file.name,
              size: file.size,
              type: file.type,
              data: evt.target.result
            };

            console.log("[Certificate] Selected file:", file.name, `${(file.size / 1024).toFixed(1)} KB`);

            // Auto-populate course name from filename if empty
            const courseInput = document.getElementById('pageCertCourseName');
            if (courseInput && !courseInput.value.trim()) {
              const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
              courseInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
            }

            const promptEl = document.getElementById('pageCertUploadPrompt');
            const previewEl = document.getElementById('pageCertFilePreview');
            const nameEl = document.getElementById('pageCertFileName');
            const sizeEl = document.getElementById('pageCertFileSize');
            const previewBox = document.getElementById('pageCertPreviewBox');

            if (promptEl) promptEl.style.display = 'none';
            if (previewEl) previewEl.style.display = 'block';
            if (nameEl) nameEl.textContent = file.name;
            if (sizeEl) {
              const kb = (file.size / 1024).toFixed(1);
              sizeEl.textContent = `${kb} KB • Ready for upload`;
            }

            if (previewBox) {
              const isPdf = file.name.toLowerCase().endsWith('.pdf');
              previewBox.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                  <i class="${isPdf ? 'fa-solid fa-file-pdf' : 'fa-solid fa-file-image'}" style="font-size: 3rem; color: ${isPdf ? '#ef4444' : '#2563eb'};"></i>
                  <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary); word-break: break-all;">${this.escapeHtml(file.name)}</div>
                  <div style="font-size: 0.78rem; color: #10b981; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> Document Attached (${(file.size / 1024).toFixed(1)} KB)</div>
                </div>
              `;
            }
          };
          reader.readAsDataURL(file);
        };

        removeFileBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectedUploadCertPageFile = null;
          fileInput.value = '';
          const promptEl = document.getElementById('pageCertUploadPrompt');
          const previewEl = document.getElementById('pageCertFilePreview');
          const previewBox = document.getElementById('pageCertPreviewBox');

          if (promptEl) promptEl.style.display = 'block';
          if (previewEl) previewEl.style.display = 'none';
          if (previewBox) {
            previewBox.innerHTML = `
              <i class="fa-regular fa-file-lines" style="font-size: 2.5rem; color: #94a3b8; margin-bottom: 0.5rem;"></i>
              <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary);">No file selected</div>
              <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">Upload a certificate to see a preview here.</div>
            `;
          }
        });
      }

      // Explicit Button Click Event
      const submitBtn = document.getElementById('pageCertSubmitBtn');
      const form = document.getElementById('uploadCertPageForm');

      submitBtn?.addEventListener('click', (e) => {
        console.log("[Certificate] Submit clicked");
        if (form) {
          e.preventDefault();
          const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
          form.dispatchEvent(submitEvent);
        }
      });

      // Form Submission Handler
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("[Certificate] Form submit triggered");

        const selectedPlatform = document.querySelector('input[name="certPlatform"]:checked')?.value || 'NPTEL';
        if (selectedPlatform !== 'NPTEL' && selectedPlatform !== 'Other') {
          this.showToast('Please select a valid certificate platform (NPTEL or Other)', 'lock');
          return;
        }

        const courseInput = document.getElementById('pageCertCourseName');
        const courseName = courseInput?.value.trim();
        if (!courseName) {
          this.showToast('Please enter the certificate/course name', 'lock');
          courseInput?.focus();
          return;
        }

        const credentialId = document.getElementById('pageCertCredentialId')?.value.trim() || 'N/A';
        const duration = document.getElementById('pageCertDuration')?.value || '';
        const scoreOrGrade = document.getElementById('pageCertScore')?.value.trim() || 'Grade Verified';
        const fileObj = this.selectedUploadCertPageFile;

        console.log("[Certificate] Selected file:", fileObj);

        if (!fileObj) {
          this.showToast('Please choose or drag and drop a certificate file to upload', 'lock');
          const dropzone = document.getElementById('pageCertDropzone');
          if (dropzone) {
            dropzone.style.borderColor = '#ef4444';
            setTimeout(() => dropzone.style.borderColor = '#cbd5e1', 2000);
          }
          return;
        }

        console.log("[Certificate] Starting verification request");
        const origSubmitText = submitBtn ? submitBtn.innerHTML : '';

        try {
          if (submitBtn) {
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying Certificate...';
            submitBtn.disabled = true;
          }

          const authority = selectedPlatform === 'NPTEL' ? 'NPTEL (IIT Madras)' : 'Other Recognized Platform';
          const current = window.store?.getCurrentPersona?.();
          const token = localStorage.getItem('token') || (window.store?.token || '');
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          if (current?.id) headers['x-user-id'] = current.id;

          const res = await fetch('http://localhost:3000/api/certificates/upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              userId: current?.id || 'sri',
              recipientName: current?.name || 'Sri Dhanush',
              skillName: courseName,
              authority: authority,
              issuer: authority,
              title: courseName,
              credentialId: credentialId,
              certificateId: credentialId,
              scoreOrGrade: scoreOrGrade,
              duration: duration,
              fileName: fileObj.name,
              fileData: fileObj.data
            })
          });

          console.log("[Certificate] Response status:", res.status);
          const data = await res.json();
          console.log("[Certificate] Response body:", data);

          const isNotVerif = !res.ok || data.status === 'NOT_VERIFIED' || data.result === 'NOT_VERIFIED' || data.result === 'FAKE';
          const isReview = data.status === 'NEEDS_MANUAL_REVIEW';
          const isVerif = !isNotVerif && !isReview && (data.status === 'VERIFIED' || data.result === 'REAL' || data.result === 'VERIFIED');

          if (isNotVerif) {
            this.showToast(`❌ Verification Result: NOT VERIFIED. Not eligible to teach.`, 'lock');
          } else if (isReview) {
            this.showToast('⚠️ Verification Result: NEEDS REVIEW. Queued for Faculty Review.', 'user');
          } else {
            this.showToast(`🎉 Certificate VERIFIED! Eligible to teach & Tutor Tier unlocked!`, 'award');
          }

          // Reload certificate status card UI
          await this.loadCertificateStatusUI();

          // Show Step 3 Success Confirmation Card & Auto-Redirect to Certificates & Portfolio after 2s
          const successBox = document.getElementById('pageCertSuccessConfirmation');
          const countdownEl = document.getElementById('pageCertRedirectCountdown');
          const iconWrapper = document.getElementById('pageCertSuccessIconWrapper');
          const iconEl = document.getElementById('pageCertSuccessIcon');
          const titleEl = document.getElementById('pageCertSuccessTitle');
          const descEl = document.getElementById('pageCertSuccessDesc');
          const statusBadgeEl = document.getElementById('pageCertSuccessStatusBadge');

          if (successBox && form) {
            if (isNotVerif) {
              if (iconWrapper) { iconWrapper.style.background = '#fee2e2'; iconWrapper.style.color = '#dc2626'; }
              if (iconEl) iconEl.className = 'fa-solid fa-circle-xmark';
              if (titleEl) titleEl.textContent = 'Verification Completed: NOT VERIFIED';
              if (descEl) descEl.textContent = data.error || data.reason || 'The certificate could not be authenticated through official registry. You are not eligible to teach.';
              if (statusBadgeEl) {
                statusBadgeEl.style.background = '#fee2e2';
                statusBadgeEl.style.borderColor = '#fca5a5';
                statusBadgeEl.style.color = '#b91c1c';
                statusBadgeEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Status: NOT VERIFIED (Not eligible to teach)';
              }
            } else if (isReview) {
              if (iconWrapper) { iconWrapper.style.background = '#ffedd5'; iconWrapper.style.color = '#ea580c'; }
              if (iconEl) iconEl.className = 'fa-solid fa-triangle-exclamation';
              if (titleEl) titleEl.textContent = 'Verification Status: NEEDS REVIEW';
              if (descEl) descEl.textContent = 'Automated issuer registry checks were inconclusive. Queued for Faculty Administrator manual audit.';
              if (statusBadgeEl) {
                statusBadgeEl.style.background = '#ffedd5';
                statusBadgeEl.style.borderColor = '#fdba74';
                statusBadgeEl.style.color = '#c2410c';
                statusBadgeEl.innerHTML = '<i class="fa-solid fa-clock"></i> Status: NEEDS REVIEW (Not eligible yet)';
              }
            } else {
              if (iconWrapper) { iconWrapper.style.background = '#dcfce7'; iconWrapper.style.color = '#16a34a'; }
              if (iconEl) iconEl.className = 'fa-solid fa-circle-check';
              if (titleEl) titleEl.textContent = 'Verification Completed: VERIFIED!';
              if (descEl) descEl.textContent = 'Certificate authentic and official issuer check passed. Tutor Tier & Book Swap Mentor Access unlocked (+2.0 Skill Credits awarded)!';
              if (statusBadgeEl) {
                statusBadgeEl.style.background = '#dcfce7';
                statusBadgeEl.style.borderColor = '#86efac';
                statusBadgeEl.style.color = '#15803d';
                statusBadgeEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Status: VERIFIED (Eligible to teach)';
              }
            }

            form.style.display = 'none';
            successBox.style.display = 'block';

            let secondsLeft = 2;
            if (countdownEl) countdownEl.textContent = `Redirecting in ${secondsLeft} seconds...`;
            
            const countdownTimer = setInterval(() => {
              secondsLeft--;
              if (countdownEl) {
                countdownEl.textContent = `Redirecting in ${secondsLeft} second${secondsLeft !== 1 ? 's' : ''}...`;
              }
              if (secondsLeft <= 0) {
                clearInterval(countdownTimer);
                // Reset form UI for next time
                form.reset();
                this.selectedUploadCertPageFile = null;
                const preview = document.getElementById('pageCertFilePreview');
                const prompt = document.getElementById('pageCertUploadPrompt');
                if (preview) preview.style.display = 'none';
                if (prompt) prompt.style.display = 'block';
                form.style.display = 'block';
                successBox.style.display = 'none';

                // Redirect to Certificates & Portfolio (#view-profile)
                this.switchView('view-profile');
                (async () => {
                  if (window.store?.fetchCertificates) {
                    await window.store.fetchCertificates();
                  }
                  if (window.store?.init) {
                    await window.store.init();
                  }
                  await this.renderProfile();
                  this.renderAll();
                  const certsSection = document.getElementById('profileCertificatesGrid');
                  if (certsSection) certsSection.scrollIntoView({ behavior: 'smooth' });
                })();
              }
            }, 1000);
          } else {
            // Fallback if successBox missing
            if (window.store?.init) await window.store.init();
            this.renderAll();
            this.switchView('view-profile');
          }

        } catch (err) {
          console.error('[Certificate] Submission error:', err);
          this.showToast('Certificate verification could not be started: ' + err.message, 'lock');
        } finally {
          if (submitBtn) {
            submitBtn.innerHTML = origSubmitText;
            submitBtn.disabled = false;
          }
        }
      });
    },

    // User requested: clicking Create a Masterclass MUST open the NEW dedicated Create Group Masterclass page.
    openHostCohortModal() {
      this.openCreateMasterclassPage();
    },

    bindCreateMasterclassEvents() {
      const inputs = [
        'mcTitleInput', 'mcSubjectSelect', 'mcCategorySelect',
        'mcShortDescInput', 'mcDateInput', 'mcTimeInput',
        'mcDurationSelect', 'mcPlatformSelect', 'mcMaxParticipantsSelect',
        'mcTagsInput'
      ];
      inputs.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', () => this.updateMasterclassPreview());
        el?.addEventListener('change', () => this.updateMasterclassPreview());
      });

      const shortDesc = document.getElementById('mcShortDescInput');
      shortDesc?.addEventListener('input', (e) => {
        const counter = document.getElementById('mcShortDescCounter');
        if (counter) counter.textContent = e.target.value.length;
      });

      const learnDetails = document.getElementById('mcLearningDetailsInput');
      learnDetails?.addEventListener('input', (e) => {
        const counter = document.getElementById('mcLearningDetailsCounter');
        if (counter) counter.textContent = e.target.value.length;
      });

      document.querySelectorAll('.mc-tag-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const tag = pill.dataset.tag;
          const tagsInput = document.getElementById('mcTagsInput');
          if (!tagsInput || !tag) return;
          let currentTags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
          const index = currentTags.indexOf(tag);
          if (index > -1) {
            currentTags.splice(index, 1);
            pill.classList.remove('active');
          } else {
            currentTags.push(tag);
            pill.classList.add('active');
          }
          tagsInput.value = currentTags.join(', ');
          this.updateMasterclassPreview();
        });
      });

      document.getElementById('backToSessionsFromCreateBtn')?.addEventListener('click', () => {
        this.switchView('view-sessions');
        history.pushState(null, '', '/sessions');
      });
      document.getElementById('mcCancelBtn')?.addEventListener('click', () => {
        this.switchView('view-sessions');
        history.pushState(null, '', '/sessions');
      });

      document.getElementById('viewMyMasterclassesBtn')?.addEventListener('click', () => {
        this.switchView('view-sessions');
        this.switchSessionsTab('MASTERCLASSES');
        history.pushState(null, '', '/sessions');
      });

      document.getElementById('mcSaveDraftBtn')?.addEventListener('click', () => {
        this.saveMasterclass('DRAFT');
      });

      document.getElementById('mcSubmitBtn')?.addEventListener('click', () => {
        this.saveMasterclass('Confirmed');
      });

      // Activated Preview card button: direct publish / save
      document.getElementById('prevJoinMasterclassBtn')?.addEventListener('click', () => {
        this.saveMasterclass('Confirmed');
      });
    },

    openCreateMasterclassPage(pushHistory = true, editSessionId = null) {
      this.editingMasterclassId = editSessionId;
      if (pushHistory) {
        history.pushState({ view: 'create-masterclass', editSessionId }, '', '/sessions/masterclass/create' + (editSessionId ? `?edit=${editSessionId}` : ''));
      }
      this.switchView('view-create-masterclass');

      const titleEl = document.querySelector('#view-create-masterclass .page-title');
      const subtitleEl = document.querySelector('#view-create-masterclass .page-subtitle');
      const submitBtn = document.getElementById('mcSubmitBtn');
      const prevJoinBtnText = document.getElementById('prevJoinBtnText');
      const prevJoinBtnIcon = document.getElementById('prevJoinBtnIcon');

      if (editSessionId) {
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: #2563eb; margin-right: 0.5rem;"></i>Edit Group Masterclass';
        if (subtitleEl) subtitleEl.textContent = 'Update any detail, timings, platform, capacity, or curriculum for this masterclass.';
        if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Masterclass Changes';
        if (prevJoinBtnText) prevJoinBtnText.textContent = 'Save Masterclass Changes';
        if (prevJoinBtnIcon) prevJoinBtnIcon.className = 'fa-solid fa-floppy-disk';
      } else {
        if (titleEl) titleEl.textContent = 'Create a Group Masterclass';
        if (subtitleEl) subtitleEl.textContent = 'Share your expertise with multiple students, host an interactive live class, and earn credits.';
        if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Create Masterclass';
        if (prevJoinBtnText) prevJoinBtnText.textContent = 'Publish & Launch Masterclass';
        if (prevJoinBtnIcon) prevJoinBtnIcon.className = 'fa-solid fa-paper-plane';

        const dateInput = document.getElementById('mcDateInput');
        if (dateInput && !dateInput.value) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          dateInput.value = tomorrow.toISOString().split('T')[0];
          dateInput.min = new Date().toISOString().split('T')[0];
        }
      }

      this.updateMasterclassPreview();
    },

    async openEditMasterclass(sessionId) {
      let sess = null;
      try {
        sess = await window.store.getSessionDetails(sessionId);
      } catch (e) {
        sess = (window.store.sessions || []).find(s => s.id === sessionId);
      }
      if (!sess) {
        this.showToast('Masterclass not found', 'xmark');
        return;
      }

      // Pre-fill form fields accurately from database
      if (document.getElementById('mcTitleInput')) document.getElementById('mcTitleInput').value = sess.topic || sess.skill || '';
      if (document.getElementById('mcSubjectSelect')) document.getElementById('mcSubjectSelect').value = sess.skill || '';
      if (document.getElementById('mcCategorySelect')) document.getElementById('mcCategorySelect').value = sess.category || '';
      if (document.getElementById('mcInstructorInput')) document.getElementById('mcInstructorInput').value = sess.teacher_name || sess.teacherName || sess.instructor || '';
      if (document.getElementById('mcThumbnailInput')) document.getElementById('mcThumbnailInput').value = sess.image_url || sess.thumbnail_url || '';
      if (document.getElementById('mcShortDescInput')) document.getElementById('mcShortDescInput').value = sess.description || '';
      if (document.getElementById('mcDateInput')) document.getElementById('mcDateInput').value = sess.date || '';
      if (document.getElementById('mcTimeInput')) document.getElementById('mcTimeInput').value = sess.time || '';
      if (document.getElementById('mcDurationSelect')) document.getElementById('mcDurationSelect').value = String(sess.hours || '1');
      if (document.getElementById('mcPlatformSelect')) document.getElementById('mcPlatformSelect').value = sess.platform || sess.meeting_platform || 'Google Meet';
      if (document.getElementById('mcMaxParticipantsSelect')) document.getElementById('mcMaxParticipantsSelect').value = String(sess.max_capacity || '30');
      if (document.getElementById('mcLearningDetailsInput')) document.getElementById('mcLearningDetailsInput').value = sess.learning_details || '';

      const seriesVal = sess.session_series_type || 'One-time Masterclass';
      document.querySelectorAll('input[name="mcSessionTypeRadio"]').forEach(r => {
        r.checked = (r.value === seriesVal);
      });

      // Tags
      let tagsArr = [];
      if (typeof sess.tags === 'string') {
        try {
          const parsed = JSON.parse(sess.tags);
          if (Array.isArray(parsed)) tagsArr = parsed;
          else tagsArr = sess.tags.split(',').map(t => t.trim());
        } catch (e) {
          tagsArr = sess.tags.split(',').map(t => t.trim());
        }
      } else if (Array.isArray(sess.tags)) {
        tagsArr = sess.tags;
      }
      if (document.getElementById('mcTagsInput')) document.getElementById('mcTagsInput').value = tagsArr.join(', ');

      if (document.getElementById('mcCreditsSelect')) document.getElementById('mcCreditsSelect').value = String(sess.credits !== undefined ? sess.credits : (sess.rate_per_student || '1'));
      if (document.getElementById('mcMinLevelSelect')) document.getElementById('mcMinLevelSelect').value = sess.minimum_academic_level || 'Any';
      if (document.getElementById('mcPrereqInput')) document.getElementById('mcPrereqInput').value = sess.prerequisites || '';
      const agree = document.getElementById('mcAgreeCheckbox');
      if (agree) agree.checked = true;

      if (document.getElementById('mcShortDescCounter')) {
        document.getElementById('mcShortDescCounter').textContent = (sess.description || '').length;
      }
      if (document.getElementById('mcLearningDetailsCounter')) {
        document.getElementById('mcLearningDetailsCounter').textContent = (sess.learning_details || '').length;
      }

      this.openCreateMasterclassPage(true, sessionId);
    },

    openEditSession(sessionId) {
      let sess = (window.store.sessions || []).find(s => s.id === sessionId);
      if (!sess) {
        this.showToast('Session not found', 'xmark');
        return;
      }
      if (sess.session_type === 'GROUP_COHORT') {
        this.openEditMasterclass(sessionId);
        return;
      }

      document.getElementById('editSessionId').value = sess.id;
      document.getElementById('editSessionSkillInput').value = sess.topic || sess.skill || '';
      document.getElementById('editSessionDateInput').value = sess.date || '';
      document.getElementById('editSessionTimeInput').value = sess.time || '';
      document.getElementById('editSessionDurationSelect').value = String(sess.hours || '1');
      document.getElementById('editSessionPlatformSelect').value = sess.platform || sess.meeting_platform || 'Google Meet';
      document.getElementById('editSessionMeetLinkInput').value = sess.zoom_join_url || sess.meet_link || '';
      document.getElementById('editSessionNotesInput').value = sess.additional_notes || '';

      this.openModal('editSessionModal');
    },

    async saveEditedSession() {
      const sessionId = document.getElementById('editSessionId')?.value;
      if (!sessionId) return;

      const skill = document.getElementById('editSessionSkillInput')?.value?.trim();
      const date = document.getElementById('editSessionDateInput')?.value;
      const time = document.getElementById('editSessionTimeInput')?.value?.trim();
      const hours = parseFloat(document.getElementById('editSessionDurationSelect')?.value || '1');
      const platform = document.getElementById('editSessionPlatformSelect')?.value || 'Google Meet';
      const meet_link = document.getElementById('editSessionMeetLinkInput')?.value?.trim() || '';
      const notes = document.getElementById('editSessionNotesInput')?.value?.trim() || '';

      if (!skill || !date || !time) {
        alert('Please fill in Skill, Date, and Time.');
        return;
      }

      const saveBtn = document.getElementById('saveEditSessionBtn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }

      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${window.store.token}`
          },
          body: JSON.stringify({
            skill,
            topic: skill,
            date,
            time,
            hours,
            platform,
            meeting_platform: platform,
            zoom_join_url: meet_link,
            additional_notes: notes
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to update session');

        this.closeModal('editSessionModal');
        this.showToast('✅ Session details updated successfully!', 'check');
        await window.store.fetchSessions();
        await this.renderSessions();
      } catch (err) {
        alert('Error updating session: ' + err.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
        }
      }
    },

    openReportIssueModal(sessionId) {
      const sess = (window.store.sessions || []).find(s => s.id === sessionId);
      document.getElementById('reportIssueSessionId').value = sessionId;
      const header = document.getElementById('reportIssueSessionHeader');
      const details = document.getElementById('reportIssueSessionDetails');
      if (header && sess) {
        header.textContent = `Session: ${sess.topic || sess.skill} (${sess.date} @ ${sess.time})`;
      }
      if (details && sess) {
        const current = window.store.getCurrentPersona();
        const otherPerson = sess.teacher_id === current?.id ? (sess.student?.name || 'Student') : (sess.teacher?.name || 'Host');
        details.textContent = `With ${otherPerson} • Platform: ${sess.platform || sess.meeting_platform || 'Google Meet'}`;
      }
      document.getElementById('reportIssueTitleInput').value = '';
      document.getElementById('reportIssueDescInput').value = '';
      this.openModal('reportIssueModal');
    },

    async submitSessionReport() {
      const sessionId = document.getElementById('reportIssueSessionId')?.value;
      const category = document.getElementById('reportIssueCategorySelect')?.value;
      const title = document.getElementById('reportIssueTitleInput')?.value?.trim();
      const description = document.getElementById('reportIssueDescInput')?.value?.trim();
      const priority = document.getElementById('reportIssuePrioritySelect')?.value || 'Standard';

      if (!title || !description) {
        alert('Please enter both an issue summary and a detailed explanation.');
        return;
      }

      const submitBtn = document.getElementById('submitReportIssueBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
      }

      try {
        const sess = (window.store.sessions || []).find(s => s.id === sessionId);
        const res = await fetch('/api/support/doubts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${window.store.token}`
          },
          body: JSON.stringify({
            title: `[DISPUTE] ${title}`,
            category: 'Session Dispute',
            course: sess?.skill || 'Live Session',
            priority,
            content: `Category: ${category}\nSession ID: ${sessionId}\nPriority: ${priority}\nDetails:\n${description}`,
            description: `Category: ${category}\nSession ID: ${sessionId}\nPriority: ${priority}\nDetails:\n${description}`
          })
        });

        this.closeModal('reportIssueModal');
        this.showToast('✅ Official dispute submitted to administration for review!', 'check');
        await this.renderSupportDesk();
      } catch (err) {
        alert('Error submitting report: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-flag"></i> Submit Official Dispute';
        }
      }
    },

    updateMasterclassPreview() {
      const title = document.getElementById('mcTitleInput')?.value?.trim() || 'Your Masterclass Title';
      const subject = document.getElementById('mcSubjectSelect')?.value || 'Subject';
      const category = document.getElementById('mcCategorySelect')?.value || 'Category';
      const shortDesc = document.getElementById('mcShortDescInput')?.value?.trim() || 'A short description of what students will learn in this masterclass.';
      const dateVal = document.getElementById('mcDateInput')?.value;
      const timeVal = document.getElementById('mcTimeInput')?.value || '05:00 PM';
      const durationVal = document.getElementById('mcDurationSelect')?.value || '1';
      const durationText = durationVal === '0.5' ? '30 mins' : durationVal === '1' ? '1 hour' : `${durationVal} hours`;
      const platform = document.getElementById('mcPlatformSelect')?.value || 'Google Meet';
      const capacity = document.getElementById('mcMaxParticipantsSelect')?.value || '30';
      const rawTags = document.getElementById('mcTagsInput')?.value || '';

      const prevTitle = document.getElementById('prevTitle');
      const prevSubjCat = document.getElementById('prevSubjCat');
      const prevDesc = document.getElementById('prevDesc');
      const prevDate = document.getElementById('prevDate');
      const prevTime = document.getElementById('prevTime');
      const prevCapacity = document.getElementById('prevCapacity');
      const prevPlatform = document.getElementById('prevPlatform');
      const prevTagsList = document.getElementById('prevTagsList');

      if (prevTitle) prevTitle.textContent = title;
      if (prevSubjCat) prevSubjCat.textContent = `${subject} • ${category}`;
      if (prevDesc) prevDesc.textContent = shortDesc;

      if (prevDate) {
        if (dateVal) {
          try {
            const d = new Date(dateVal + 'T00:00:00');
            prevDate.textContent = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
          } catch (e) {
            prevDate.textContent = dateVal;
          }
        } else {
          prevDate.textContent = 'DD MMM YYYY';
        }
      }

      if (prevTime) prevTime.textContent = `${timeVal} (${durationText})`;
      if (prevCapacity) prevCapacity.textContent = `${capacity} students`;
      if (prevPlatform) prevPlatform.textContent = platform;

      if (prevTagsList) {
        const tags = rawTags.split(',').map(t => t.trim()).filter(Boolean);
        if (tags.length > 0) {
          prevTagsList.innerHTML = tags.map(t => `<span class="badge" style="background: #e2e8f0; color: #475569; font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px;">${t}</span>`).join(' ');
        } else {
          prevTagsList.innerHTML = `<span class="badge" style="background: #e2e8f0; color: #475569; font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px;">react</span> <span class="badge" style="background: #e2e8f0; color: #475569; font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px;">frontend</span>`;
        }
      }
    },

    async saveMasterclass(status = 'Confirmed') {
      const title = document.getElementById('mcTitleInput')?.value?.trim();
      const subject = document.getElementById('mcSubjectSelect')?.value;
      const category = document.getElementById('mcCategorySelect')?.value || '';
      const shortDesc = document.getElementById('mcShortDescInput')?.value?.trim();
      const date = document.getElementById('mcDateInput')?.value;
      const time = document.getElementById('mcTimeInput')?.value?.trim();
      const durationHours = parseFloat(document.getElementById('mcDurationSelect')?.value || '1');
      const platform = document.getElementById('mcPlatformSelect')?.value || 'Google Meet';
      const maxParticipants = parseInt(document.getElementById('mcMaxParticipantsSelect')?.value || '30', 10);
      const seriesType = document.querySelector('input[name="mcSessionTypeRadio"]:checked')?.value || 'One-time Masterclass';
      const learningDetails = document.getElementById('mcLearningDetailsInput')?.value?.trim() || '';
      const rawTags = document.getElementById('mcTagsInput')?.value || '';
      const tags = rawTags.split(',').map(t => t.trim()).filter(Boolean);
      const credits = parseFloat(document.getElementById('mcCreditsSelect')?.value || '1');
      const minLevel = document.getElementById('mcMinLevelSelect')?.value || 'Any';
      const prerequisites = document.getElementById('mcPrereqInput')?.value?.trim() || '';
      const agreed = document.getElementById('mcAgreeCheckbox')?.checked;

      const instructorName = document.getElementById('mcInstructorInput')?.value?.trim() || '';
      const thumbnailUrl = document.getElementById('mcThumbnailInput')?.value?.trim() || '';

      if (!title) {
        alert('Please enter a Masterclass Title.');
        document.getElementById('mcTitleInput')?.focus();
        return;
      }
      if (!subject) {
        alert('Please select a Subject / Skill.');
        document.getElementById('mcSubjectSelect')?.focus();
        return;
      }
      if (!shortDesc) {
        alert('Please enter a Short Description.');
        document.getElementById('mcShortDescInput')?.focus();
        return;
      }
      if (!date) {
        alert('Please select a Date for your masterclass.');
        document.getElementById('mcDateInput')?.focus();
        return;
      }
      if (!time) {
        alert('Please enter a Start Time.');
        document.getElementById('mcTimeInput')?.focus();
        return;
      }
      if (status === 'Confirmed' && !agreed) {
        alert('Please agree to follow the community guidelines.');
        document.getElementById('mcAgreeCheckbox')?.focus();
        return;
      }

      const submitBtn = document.getElementById('mcSubmitBtn');
      const draftBtn = document.getElementById('mcSaveDraftBtn');
      const prevJoinBtn = document.getElementById('prevJoinMasterclassBtn');
      if (submitBtn) submitBtn.disabled = true;
      if (draftBtn) draftBtn.disabled = true;
      if (prevJoinBtn) prevJoinBtn.disabled = true;

      try {
        if (this.editingMasterclassId) {
          // UPDATE EXISTING MASTERCLASS
          const updatePayload = {
            topic: title,
            skill: subject,
            category,
            description: shortDesc,
            date,
            time,
            hours: durationHours,
            platform,
            meeting_platform: platform,
            max_capacity: maxParticipants,
            session_series_type: seriesType,
            learning_details: learningDetails,
            tags,
            credits,
            rate_per_student: credits,
            minimum_academic_level: minLevel,
            prerequisites,
            instructor: instructorName,
            teacher_name: instructorName,
            thumbnail_url: thumbnailUrl,
            image_url: thumbnailUrl
          };

          const res = await fetch(`/api/sessions/${this.editingMasterclassId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${window.store.token}`
            },
            body: JSON.stringify(updatePayload)
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || data.message || 'Failed to update Masterclass');

          this.showToast('Masterclass updated successfully.', 'check');
          this.editingMasterclassId = null;
          document.getElementById('createMasterclassForm')?.reset();
          this.updateMasterclassPreview();

          await window.store.fetchSessions();
          await window.store.fetchMySessions();
          this.renderNavbar();
          await this.renderSessions();

          this.switchView('view-sessions');
          this.switchSessionsTab('MASTERCLASSES');
          history.pushState(null, '', '/sessions');
          return;
        }

        // CREATE NEW MASTERCLASS
        const payload = {
          title,
          skillName: subject,
          subject,
          category,
          description: shortDesc,
          date,
          time,
          durationHours,
          platform,
          meeting_platform: platform,
          maxParticipants,
          session_series_type: seriesType,
          learning_details: learningDetails,
          tags,
          credits_per_attendee: credits,
          minimum_academic_level: minLevel,
          prerequisites,
          status,
          instructor: instructorName,
          thumbnail_url: thumbnailUrl,
          image_url: thumbnailUrl
        };

        const res = await fetch('/api/sessions/cohort', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${window.store.token}`
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Failed to create Masterclass');
        }

        if (status === 'DRAFT') {
          this.showToast('📝 Masterclass saved as Draft!', 'check');
        } else {
          this.showToast('🚀 Group Masterclass created successfully and open to all students!', 'check');
        }

        document.getElementById('createMasterclassForm')?.reset();
        this.updateMasterclassPreview();

        await window.store.fetchSessions();
        this.renderNavbar();
        await this.renderSessions();

        this.switchView('view-sessions');
        this.switchSessionsTab(status === 'DRAFT' ? 'MASTERCLASSES' : 'GROUPS');
        history.pushState(null, '', '/sessions');
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (draftBtn) draftBtn.disabled = false;
        if (prevJoinBtn) prevJoinBtn.disabled = false;
      }
    },

    // =========================================================================
    // 6-STEP BOOKING WORKFLOW CONTROLLER
    // =========================================================================
    bookingState: {
      step: 1,
      mentor: null,
      subject: null,
      topic: null,
      subjectNotes: '',
      date: null,
      time: null,
      durationHours: 1.0,
      creditsRequired: 2.5,
      title: '',
      description: '',
      sessionType: '1-on-1 Swap Session',
      meetingPlatform: 'Google Meet',
      additionalNotes: '',
      bookingResult: null
    },

    calendarMonth: new Date().getMonth(),
    calendarYear: new Date().getFullYear(),
    bookingMentorsCache: [],
    bookingSubjectsCache: [],

    bindBookingFlowEvents() {
      // Step 1: Mentor Search
      const mentorSearch = document.getElementById('bookingMentorSearchInput');
      mentorSearch?.addEventListener('input', (e) => {
        this.filterBookingMentors(e.target.value);
      });
      document.getElementById('btnCancelBookingStep1')?.addEventListener('click', () => {
        this.switchView('view-sessions');
        history.pushState(null, '', '/sessions');
      });
      document.getElementById('btnContinueToSubject')?.addEventListener('click', () => {
        this.navigateToBookingStep(2);
      });

      // Step 2: Subject Search & Navigation
      const subjectSearch = document.getElementById('bookingSubjectSearchInput');
      subjectSearch?.addEventListener('input', (e) => {
        this.filterBookingSubjects(e.target.value);
      });
      document.getElementById('bookingSubjectNotes')?.addEventListener('input', (e) => {
        this.bookingState.subjectNotes = e.target.value;
      });
      document.getElementById('btnBackToMentor')?.addEventListener('click', () => {
        this.navigateToBookingStep(1);
      });
      document.getElementById('btnContinueToDateTime')?.addEventListener('click', () => {
        this.navigateToBookingStep(3);
      });

      // Step 3: Calendar navigation & Duration selection
      document.getElementById('calPrevMonthBtn')?.addEventListener('click', () => {
        this.calendarMonth--;
        if (this.calendarMonth < 0) {
          this.calendarMonth = 11;
          this.calendarYear--;
        }
        this.renderBookingCalendar();
      });
      document.getElementById('calNextMonthBtn')?.addEventListener('click', () => {
        this.calendarMonth++;
        if (this.calendarMonth > 11) {
          this.calendarMonth = 0;
          this.calendarYear++;
        }
        this.renderBookingCalendar();
      });

      document.querySelectorAll('#bookingDurationOptionsList .duration-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#bookingDurationOptionsList .duration-card-btn').forEach(b => {
            b.classList.remove('active');
            b.style.border = '1px solid #cbd5e1';
            b.style.background = '#fff';
          });
          btn.classList.add('active');
          btn.style.border = '2px solid #2563eb';
          btn.style.background = '#eff6ff';

          const hours = parseFloat(btn.dataset.hours || '1');
          this.bookingState.durationHours = hours;
          const rate = this.bookingState.mentor?.rate || 2.5;
          this.bookingState.creditsRequired = parseFloat((hours * rate).toFixed(1));
          this.updateBookingSidebar();
          this.validateBookingStep3();
        });
      });

      document.getElementById('btnBackToSubject')?.addEventListener('click', () => {
        this.navigateToBookingStep(2);
      });
      document.getElementById('btnContinueToDetails')?.addEventListener('click', () => {
        this.navigateToBookingStep(4);
      });

      // Step 4: Session Details inputs
      const titleInput = document.getElementById('bookingSessionTitle');
      const descInput = document.getElementById('bookingSessionDescription');
      const platformSelect = document.getElementById('bookingMeetingPlatformSelect');
      const typeSelect = document.getElementById('bookingSessionTypeSelect');
      const addNotesInput = document.getElementById('bookingAdditionalNotes');

      const validateStep4Live = () => {
        const title = titleInput?.value?.trim() || '';
        const desc = descInput?.value?.trim() || '';
        this.bookingState.title = title;
        this.bookingState.description = desc;
        this.bookingState.meetingPlatform = platformSelect?.value || 'Google Meet';
        this.bookingState.sessionType = typeSelect?.value || '1-on-1 Swap Session';
        this.bookingState.additionalNotes = addNotesInput?.value?.trim() || '';

        const continueBtn = document.getElementById('btnContinueToReview');
        if (continueBtn) {
          continueBtn.disabled = !(title.length >= 3 && desc.length >= 5);
        }
      };

      titleInput?.addEventListener('input', validateStep4Live);
      descInput?.addEventListener('input', validateStep4Live);
      platformSelect?.addEventListener('change', validateStep4Live);
      typeSelect?.addEventListener('change', validateStep4Live);
      addNotesInput?.addEventListener('input', validateStep4Live);

      document.getElementById('btnBackToDateTime')?.addEventListener('click', () => {
        this.navigateToBookingStep(3);
      });
      document.getElementById('btnContinueToReview')?.addEventListener('click', () => {
        this.navigateToBookingStep(5);
      });

      // Step 5: Review & Edit links & Confirm
      document.querySelectorAll('.edit-step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = parseInt(btn.dataset.targetstep || '1', 10);
          this.navigateToBookingStep(target);
        });
      });

      document.getElementById('btnBackToDetails')?.addEventListener('click', () => {
        this.navigateToBookingStep(4);
      });
      document.getElementById('btnConfirmBooking')?.addEventListener('click', () => {
        this.confirmBooking();
      });

      // Top Back to My Sessions button
      document.getElementById('backToSessionsFromBookingBtn')?.addEventListener('click', () => {
        this.switchView('view-sessions');
        history.pushState(null, '', '/sessions');
      });

      // Step 6: Success screen buttons
      document.getElementById('btnSuccessViewSession')?.addEventListener('click', () => {
        this.switchView('view-sessions');
        this.switchSessionsTab('UPCOMING');
        history.pushState(null, '', '/sessions');
      });
      document.getElementById('btnSuccessGoSessions')?.addEventListener('click', () => {
        this.switchView('view-sessions');
        this.switchSessionsTab('UPCOMING');
        history.pushState(null, '', '/sessions');
      });
      document.getElementById('btnSuccessAddCalendar')?.addEventListener('click', () => {
        this.downloadBookingCalendarIcs();
      });

      // Stepper click to jump to completed steps
      document.querySelectorAll('#bookingProgressStepper .booking-step-item').forEach(item => {
        item.addEventListener('click', () => {
          const targetStep = parseInt(item.dataset.step, 10);
          if (targetStep < this.bookingState.step) {
            this.navigateToBookingStep(targetStep);
          }
        });
      });
    },

    startBookingFlow(teacherId = null, skillName = null, hourlyRate = null, tier = null) {
      this.bookingState = {
        step: 1,
        mentor: null,
        subject: null,
        topic: null,
        subjectNotes: '',
        date: null,
        time: null,
        durationHours: 1.0,
        creditsRequired: 2.5,
        title: '',
        description: '',
        sessionType: '1-on-1 Swap Session',
        meetingPlatform: 'Google Meet',
        additionalNotes: '',
        bookingResult: null
      };

      if (teacherId) {
        const teacher = (window.store?.personas && window.store.personas[teacherId]) ||
          (this.bookingMentorsCache || []).find(m => m.id === teacherId);
        if (teacher) {
          const rate = hourlyRate !== null && hourlyRate !== undefined ? Number(hourlyRate) : (teacher.rate || 2.5);
          this.bookingState.mentor = {
            id: teacher.id,
            name: teacher.name,
            tier: tier || teacher.tier || 'Elite Mentor',
            rating: teacher.rating || '5.0',
            reviewsCount: teacher.reviewsCount || teacher.reviews_count || 32,
            rate: rate,
            skills: teacher.skillsOffered || teacher.skills || (skillName ? [{ name: skillName }] : []),
            avatar: window.getStudentAvatar ? window.getStudentAvatar(teacher.id) : (teacher.avatar || 'peer1'),
            availabilityText: teacher.availabilityText || 'Available Today',
            major: teacher.major || 'Computer Science'
          };
          this.bookingState.creditsRequired = parseFloat((this.bookingState.durationHours * rate).toFixed(1));
          if (skillName) {
            this.bookingState.subject = skillName;
          }
        }
      } else {
        const saved = sessionStorage.getItem('skillswap_booking_flow');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
              this.bookingState = Object.assign(this.bookingState, parsed);
            }
          } catch (e) { }
        }
      }

      sessionStorage.setItem('skillswap_booking_flow', JSON.stringify(this.bookingState));
      this.navigateToBookingStep(1);
    },

    navigateToBookingStep(stepNum, pushHistory = true) {
      this.bookingState.step = stepNum;

      const stepRoutes = {
        1: 'mentor',
        2: 'subject',
        3: 'date-time',
        4: 'details',
        5: 'review',
        6: 'success'
      };

      const routeSlug = stepRoutes[stepNum] || 'mentor';
      if (pushHistory) {
        history.pushState({ view: 'booking', step: stepNum }, '', `/sessions/book/${routeSlug}`);
      }

      this.switchView('view-booking');

      const stepper = document.getElementById('bookingProgressStepper');
      const mainGrid = document.getElementById('bookingMainGrid');
      if (stepNum === 6) {
        if (stepper) stepper.style.display = 'none';
        if (mainGrid) mainGrid.style.display = 'none';
      } else {
        if (stepper) stepper.style.display = 'flex';
        if (mainGrid) mainGrid.style.display = 'grid';
      }

      for (let i = 1; i <= 5; i++) {
        const item = document.querySelector(`.booking-step-item[data-step="${i}"]`);
        const circle = document.getElementById(`stepCircle${i}`);
        const label = document.getElementById(`stepLabel${i}`);
        const divider = document.getElementById(`stepDivider${i}`);

        if (!item || !circle || !label) continue;

        if (i < stepNum) {
          item.className = 'booking-step-item completed';
          circle.innerHTML = '<i class="fa-solid fa-check"></i>';
          circle.style.background = '#10b981';
          circle.style.color = '#fff';
          label.style.color = '#0f172a';
          if (divider) divider.style.background = '#10b981';
        } else if (i === stepNum) {
          item.className = 'booking-step-item active';
          circle.textContent = i;
          circle.style.background = '#2563eb';
          circle.style.color = '#fff';
          label.style.color = '#2563eb';
          label.style.fontWeight = '700';
          if (divider) divider.style.background = '#e2e8f0';
        } else {
          item.className = 'booking-step-item';
          circle.textContent = i;
          circle.style.background = '#f1f5f9';
          circle.style.color = '#94a3b8';
          label.style.color = '#94a3b8';
          label.style.fontWeight = '600';
          if (divider) divider.style.background = '#e2e8f0';
        }
      }

      document.querySelectorAll('.booking-step-view').forEach(v => v.style.display = 'none');
      const currentView = document.getElementById(`step-book-${routeSlug}`);
      if (currentView) currentView.style.display = 'block';

      sessionStorage.setItem('skillswap_booking_flow', JSON.stringify(this.bookingState));

      if (stepNum === 1) this.loadBookingMentors();
      if (stepNum === 2) this.loadBookingSubjects();
      if (stepNum === 3) {
        this.renderBookingCalendar();
        this.loadBookingDurationRates();
      }
      if (stepNum === 4) this.loadBookingDetailsForm();
      if (stepNum === 5) this.loadBookingReview();
      if (stepNum === 6) this.loadBookingSuccess();

      this.updateBookingSidebar();
    },

    async loadBookingMentors() {
      const listContainer = document.getElementById('bookingMentorCardsList');
      if (!listContainer) return;

      listContainer.innerHTML = `<div style="text-align: center; padding: 2rem; color: #94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Loading available mentors...</div>`;

      try {
        const res = await fetch('/api/booking/mentors', {
          headers: { Authorization: `Bearer ${window.store.token}` }
        });
        const data = await res.json();
        const currentUserId = window.store.getCurrentPersona()?.id;
        this.bookingMentorsCache = (data.mentors || []).filter(m => m.id !== currentUserId);

        // If a mentor is already pre-selected in this.bookingState, ensure they exist and appear at top
        if (this.bookingState.mentor) {
          const idx = this.bookingMentorsCache.findIndex(m => m.id === this.bookingState.mentor.id);
          if (idx >= 0) {
            this.bookingState.mentor = Object.assign({}, this.bookingMentorsCache[idx], this.bookingState.mentor);
            const [selected] = this.bookingMentorsCache.splice(idx, 1);
            this.bookingMentorsCache.unshift(selected);
          } else {
            this.bookingMentorsCache.unshift(this.bookingState.mentor);
          }
        }

        this.renderBookingMentorCards(this.bookingMentorsCache);
      } catch (err) {
        console.error('Error loading mentors:', err);
        listContainer.innerHTML = `<div style="color: #ef4444; padding: 1rem;">Failed to load mentors.</div>`;
      }
    },

    filterBookingMentors(query) {
      const q = (query || '').toLowerCase().trim();
      if (!q) {
        this.renderBookingMentorCards(this.bookingMentorsCache);
        return;
      }
      const filtered = this.bookingMentorsCache.filter(m => {
        const name = (m.name || '').toLowerCase();
        const skills = (m.skills || []).map(s => (s.name || '').toLowerCase()).join(' ');
        return name.includes(q) || skills.includes(q);
      });
      this.renderBookingMentorCards(filtered);
    },

    renderBookingMentorCards(mentors) {
      const listContainer = document.getElementById('bookingMentorCardsList');
      if (!listContainer) return;

      if (!mentors || mentors.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; padding: 2rem; color: #94a3b8;">No mentors found matching your search.</div>`;
        return;
      }

      listContainer.innerHTML = mentors.map(m => {
        const isSelected = this.bookingState.mentor?.id === m.id;
        const initials = (m.name || 'M').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const primarySkill = (m.skills && m.skills[0]?.name) || 'Computer Science';
        const skillsPills = (m.skills || []).slice(0, 3).map(s => `
          <span style="background: #f1f5f9; color: #475569; font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: 4px;">${s.name || s}</span>
        `).join('');

        return `
          <div class="booking-mentor-card ${isSelected ? 'selected' : ''}" data-mentorid="${m.id}">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="width: 46px; height: 46px; border-radius: 50%; background: #d97706; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1rem; flex-shrink: 0;">
                ${initials}
              </div>
              <div>
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                  <span style="font-weight: 800; font-size: 0.98rem; color: #0f172a;">${m.name}</span>
                  <span style="background: #eff6ff; color: #2563eb; font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 4px;">${m.tier || 'Elite Mentor'}</span>
                  <span style="font-size: 0.78rem; color: #64748b;">⭐ ${m.rating || '4.8'} (${m.reviewsCount || 32} reviews)</span>
                </div>
                <div style="font-size: 0.82rem; color: #64748b; margin: 0.2rem 0 0.4rem;">${primarySkill}</div>
                <div style="display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center;">
                  ${skillsPills}
                  <span style="font-size: 0.75rem; color: #16a34a; font-weight: 600; margin-left: 0.25rem;">
                    <i class="fa-regular fa-circle-check"></i> ${m.availabilityText || 'Available Today'}
                  </span>
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 1.25rem;">
              <div style="text-align: right;">
                <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a;">${m.rate || 2.5} <span style="font-size: 0.78rem; font-weight: 600; color: #64748b;">Credits/hr</span></div>
              </div>
              <div class="mentor-select-radio-circle"></div>
            </div>
          </div>
        `;
      }).join('');

      listContainer.querySelectorAll('.booking-mentor-card').forEach(card => {
        card.addEventListener('click', () => {
          const mentorId = card.dataset.mentorid;
          const mentor = this.bookingMentorsCache.find(m => m.id === mentorId);
          if (!mentor) return;

          this.bookingState.mentor = mentor;
          const rate = mentor.rate || 2.5;
          this.bookingState.creditsRequired = parseFloat((this.bookingState.durationHours * rate).toFixed(1));

          listContainer.querySelectorAll('.booking-mentor-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');

          const continueBtn = document.getElementById('btnContinueToSubject');
          if (continueBtn) continueBtn.disabled = false;

          this.updateBookingSidebar();
        });
      });

      const continueBtn = document.getElementById('btnContinueToSubject');
      if (continueBtn) continueBtn.disabled = !this.bookingState.mentor;
    },

    async loadBookingSubjects() {
      const grid = document.getElementById('bookingSubjectsGrid');
      if (!grid) return;

      document.querySelectorAll('.dyn-mentor-name').forEach(el => {
        el.textContent = this.bookingState.mentor?.name || 'mentor';
      });

      try {
        const res = await fetch('/api/booking/subjects', {
          headers: { Authorization: `Bearer ${window.store.token}` }
        });
        const data = await res.json();
        this.bookingSubjectsCache = data.subjects || [];
        this.renderBookingSubjectsGrid(this.bookingSubjectsCache);
      } catch (err) {
        console.error('Error loading subjects:', err);
      }
    },

    filterBookingSubjects(query) {
      const qRaw = (query || '').trim();
      const qNorm = qRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!qNorm) {
        this.renderBookingSubjectsGrid(this.bookingSubjectsCache);
        return;
      }
      const filtered = (this.bookingSubjectsCache || []).filter(s => {
        const nameNorm = (s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const catNorm = (s.category || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const topicsNorm = (s.topics || []).map(t => t.toLowerCase().replace(/[^a-z0-9]/g, '')).join(' ');
        return nameNorm.includes(qNorm) || catNorm.includes(qNorm) || topicsNorm.includes(qNorm);
      });
      this.renderBookingSubjectsGrid(filtered);
    },

    renderBookingSubjectsGrid(subjects) {
      const grid = document.getElementById('bookingSubjectsGrid');
      if (!grid) return;

      if (!subjects || subjects.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 1.5rem; color: #94a3b8;">No subjects found matching your search.</div>`;
        const container = document.getElementById('bookingTopicPillsContainer');
        if (container) container.innerHTML = `<span style="font-size: 0.82rem; color: #94a3b8;">No available topics</span>`;
        const continueBtn = document.getElementById('btnContinueToDateTime');
        if (continueBtn) continueBtn.disabled = true;
        return;
      }

      grid.innerHTML = subjects.map(s => {
        const isSelected = this.bookingState.subject === s.name;
        return `
          <div class="booking-subject-card ${isSelected ? 'selected' : ''}" data-subject="${s.name}">
            <div style="font-size: 1.6rem; margin-bottom: 0.35rem;">${s.icon || '📘'}</div>
            <div style="font-weight: 700; font-size: 0.9rem; color: #0f172a; margin-bottom: 0.2rem;">${s.name}</div>
            <div style="font-size: 0.75rem; color: #64748b;">${(s.topics || []).length} topics • ${s.category || 'Core'}</div>
          </div>
        `;
      }).join('');

      let activeSubject = this.bookingState.subject;
      if (!activeSubject || !subjects.some(s => s.name === activeSubject)) {
        activeSubject = subjects[0].name;
        this.bookingState.subject = activeSubject;
        this.bookingState.topic = null;
      }

      grid.querySelectorAll('.booking-subject-card').forEach(card => {
        const isSel = card.dataset.subject === activeSubject;
        card.classList.toggle('selected', isSel);

        card.addEventListener('click', () => {
          const subjectName = card.dataset.subject;
          if (this.bookingState.subject !== subjectName) {
            this.bookingState.subject = subjectName;
            this.bookingState.topic = null;
          }

          grid.querySelectorAll('.booking-subject-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');

          this.renderTopicPillsForSubject(subjectName);
          this.updateBookingSidebar();
        });
      });

      this.renderTopicPillsForSubject(activeSubject);
      this.updateBookingSidebar();
    },

    renderTopicPillsForSubject(subjectName) {
      const container = document.getElementById('bookingTopicPillsContainer');
      if (!container) return;

      const subjectObj = (this.bookingSubjectsCache || []).find(s => s.name === subjectName);
      const topics = subjectObj?.topics || ['Basics & Fundamentals', 'Problem Solving', 'Real-world Project', 'Interview Questions'];

      container.innerHTML = topics.map(topic => {
        const isSelected = this.bookingState.topic === topic;
        return `
          <button type="button" class="booking-topic-pill ${isSelected ? 'selected' : ''}" data-topic="${topic}">
            ${topic}
          </button>
        `;
      }).join('');

      container.querySelectorAll('.booking-topic-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const topic = pill.dataset.topic;
          this.bookingState.topic = topic;

          container.querySelectorAll('.booking-topic-pill').forEach(p => p.classList.remove('selected'));
          pill.classList.add('selected');

          const continueBtn = document.getElementById('btnContinueToDateTime');
          if (continueBtn) continueBtn.disabled = false;

          this.updateBookingSidebar();
        });
      });

      const continueBtn = document.getElementById('btnContinueToDateTime');
      if (continueBtn) continueBtn.disabled = !this.bookingState.topic;
    },

    renderBookingCalendar() {
      const monthTitle = document.getElementById('calMonthYearTitle');
      const daysGrid = document.getElementById('calDaysGrid');
      if (!monthTitle || !daysGrid) return;

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      monthTitle.textContent = `${monthNames[this.calendarMonth]} ${this.calendarYear}`;

      daysGrid.innerHTML = '';

      const firstDayIndex = new Date(this.calendarYear, this.calendarMonth, 1).getDay();
      const daysInMonth = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Blank prefix cells
      for (let b = 0; b < firstDayIndex; b++) {
        const blank = document.createElement('div');
        blank.className = 'cal-day-cell disabled';
        daysGrid.appendChild(blank);
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day-cell';
        cell.textContent = day;

        const cellDate = new Date(this.calendarYear, this.calendarMonth, day);
        cellDate.setHours(0, 0, 0, 0);

        const yyyy = this.calendarYear;
        const mm = String(this.calendarMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        cell.dataset.date = dateStr;

        if (cellDate < today) {
          cell.classList.add('disabled');
        } else {
          if (cellDate.getTime() === today.getTime()) {
            cell.classList.add('today');
          }
          if (this.bookingState.date === dateStr) {
            cell.classList.add('selected');
          }

          cell.addEventListener('click', () => {
            daysGrid.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('selected'));
            cell.classList.add('selected');
            this.bookingState.date = dateStr;
            this.loadBookingSlots();
            this.updateBookingSidebar();
            this.validateBookingStep3();
          });
        }

        daysGrid.appendChild(cell);
      }

      if (!this.bookingState.date) {
        // Auto select tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tY = tomorrow.getFullYear();
        const tM = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const tD = String(tomorrow.getDate()).padStart(2, '0');
        this.bookingState.date = `${tY}-${tM}-${tD}`;
        const autoCell = daysGrid.querySelector(`[data-date="${this.bookingState.date}"]`);
        if (autoCell) autoCell.classList.add('selected');
      }

      this.loadBookingSlots();
    },

    loadBookingDurationRates() {
      const rate = this.bookingState.mentor?.rate || 2.5;
      document.querySelectorAll('#bookingDurationOptionsList .duration-card-btn').forEach(btn => {
        const hours = parseFloat(btn.dataset.hours || '1');
        const credits = (hours * rate).toFixed(2).replace(/\.00$/, '').replace(/\.([1-9])0$/, '.$1');
        const calcEl = btn.querySelector('.dur-credit-calc');
        if (calcEl) calcEl.textContent = `(${credits} Credits)`;
      });
    },

    async loadBookingSlots() {
      const slotsContainer = document.getElementById('bookingTimeSlotsList');
      if (!slotsContainer) return;

      const mentorId = this.bookingState.mentor?.id;
      const dateStr = this.bookingState.date;

      if (!mentorId || !dateStr) {
        slotsContainer.innerHTML = `<div style="color: #94a3b8; font-size: 0.8rem; padding: 1rem;">Select a date to view available times.</div>`;
        return;
      }

      slotsContainer.innerHTML = `<div style="color: #94a3b8; font-size: 0.8rem; padding: 1rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading slots...</div>`;

      try {
        const res = await fetch(`/api/booking/availability?mentorId=${mentorId}&date=${dateStr}`, {
          headers: { Authorization: `Bearer ${window.store.token}` }
        });
        const data = await res.json();
        const slots = data.slots || ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM'];
        const bookedSlots = data.bookedSlots || [];

        slotsContainer.innerHTML = slots.map(time => {
          const isBooked = bookedSlots.includes(time);
          const isSelected = this.bookingState.time === time;
          return `
            <button type="button" class="booking-slot-btn ${isBooked ? 'booked' : ''} ${isSelected ? 'selected' : ''}" data-time="${time}" ${isBooked ? 'disabled' : ''}>
              ${time} ${isBooked ? '(Booked)' : ''}
            </button>
          `;
        }).join('');

        slotsContainer.querySelectorAll('.booking-slot-btn:not(.booked)').forEach(btn => {
          btn.addEventListener('click', () => {
            slotsContainer.querySelectorAll('.booking-slot-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            this.bookingState.time = btn.dataset.time;
            this.updateBookingSidebar();
            this.validateBookingStep3();
          });
        });

        this.validateBookingStep3();
      } catch (err) {
        console.error('Error loading slots:', err);
      }
    },

    validateBookingStep3() {
      const continueBtn = document.getElementById('btnContinueToDetails');
      if (continueBtn) {
        continueBtn.disabled = !(this.bookingState.date && this.bookingState.time);
      }
    },

    loadBookingDetailsForm() {
      const titleInput = document.getElementById('bookingSessionTitle');
      const descInput = document.getElementById('bookingSessionDescription');
      const platformSelect = document.getElementById('bookingMeetingPlatformSelect');
      const notesInput = document.getElementById('bookingAdditionalNotes');

      if (titleInput && !titleInput.value) {
        titleInput.value = `Help with ${this.bookingState.topic || this.bookingState.subject || 'Programming'}`;
        this.bookingState.title = titleInput.value;
      }
      if (descInput && !descInput.value && this.bookingState.subjectNotes) {
        descInput.value = this.bookingState.subjectNotes;
        this.bookingState.description = descInput.value;
      }
      if (platformSelect) {
        platformSelect.value = this.bookingState.meetingPlatform || 'Google Meet';
      }
      if (notesInput && !notesInput.value && this.bookingState.additionalNotes) {
        notesInput.value = this.bookingState.additionalNotes;
      }

      const continueBtn = document.getElementById('btnContinueToReview');
      if (continueBtn) {
        const title = titleInput?.value?.trim() || '';
        const desc = descInput?.value?.trim() || '';
        continueBtn.disabled = !(title.length >= 3 && desc.length >= 5);
      }
    },

    async loadBookingReview() {
      const m = this.bookingState.mentor;
      const hours = this.bookingState.durationHours;
      const rate = m?.rate || 2.5;
      const credits = parseFloat((hours * rate).toFixed(1));
      this.bookingState.creditsRequired = credits;

      // Update Review Card Elements
      const mentorName = document.getElementById('reviewMentorName');
      const mentorBadge = document.getElementById('reviewMentorBadge');
      if (mentorName) mentorName.textContent = m?.name || 'Mentor';
      if (mentorBadge) mentorBadge.textContent = `${m?.tier || 'Elite Mentor'} • ⭐ ${m?.rating || '4.8'} (${m?.reviewsCount || 32} reviews)`;

      const subjName = document.getElementById('reviewSubjectName');
      const topicName = document.getElementById('reviewTopicName');
      if (subjName) subjName.textContent = this.bookingState.subject || 'Subject';
      if (topicName) topicName.textContent = this.bookingState.topic || 'General Discussion';

      const dateTimeText = document.getElementById('reviewDateTimeText');
      if (dateTimeText) {
        let dateFormatted = this.bookingState.date || 'Today';
        try {
          const d = new Date(this.bookingState.date + 'T00:00:00');
          dateFormatted = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) { }
        dateTimeText.textContent = `${dateFormatted} • ${this.bookingState.time || '05:00 PM'}`;
      }

      const durText = document.getElementById('reviewDurationText');
      if (durText) durText.textContent = `${hours === 0.5 ? '30 Minutes' : hours === 1 ? '1 Hour' : hours + ' Hours'} (${credits} Credits)`;

      const titleText = document.getElementById('reviewTitleText');
      const descText = document.getElementById('reviewDescText');
      if (titleText) titleText.textContent = this.bookingState.title || '1-on-1 Swap Session';
      if (descText) descText.textContent = this.bookingState.description || 'General discussion & problem solving';

      const typeText = document.getElementById('reviewTypeText');
      if (typeText) typeText.textContent = this.bookingState.sessionType || '1-on-1 Swap Session';

      const platText = document.getElementById('reviewPlatformText');
      if (platText) platText.textContent = this.bookingState.meetingPlatform || 'Google Meet';

      const creditsText = document.getElementById('reviewCreditsRequiredText');
      if (creditsText) creditsText.textContent = `${credits} Credits`;

      const notice = document.getElementById('reviewEscrowNotice');
      if (notice) notice.textContent = `${credits} Credits will be deducted from your wallet after successful booking.`;

      // Wallet Balance Card
      const walletCard = document.getElementById('bookingWalletCard');
      const balanceEl = document.getElementById('sideWalletBalanceText');
      const statusBox = document.getElementById('sideWalletStatusBox');
      const confirmBtn = document.getElementById('btnConfirmBooking');

      if (walletCard) walletCard.style.display = 'block';

      try {
        const res = await fetch('/api/wallet', {
          headers: { Authorization: `Bearer ${window.store.token}` }
        });
        const wData = await res.json();
        const currentBalance = wData.wallet?.balance || window.store.getCurrentPersona()?.credits || 0;

        if (balanceEl) balanceEl.textContent = `${currentBalance.toFixed(1)} Credits`;

        if (currentBalance < credits) {
          if (statusBox) {
            statusBox.style.background = '#fef2f2';
            statusBox.style.borderColor = '#fecaca';
            statusBox.style.color = '#991b1b';
            statusBox.innerHTML = `
              <div style="font-weight: 700; margin-bottom: 0.2rem;"><i class="fa-solid fa-triangle-exclamation"></i> Insufficient Credits</div>
              <div>You need ${credits} credits but only have ${currentBalance.toFixed(1)}. Earn credits by teaching peers or answering doubts!</div>
            `;
          }
          if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.5';
            confirmBtn.style.cursor = 'not-allowed';
          }
        } else {
          if (statusBox) {
            statusBox.style.background = '#f0fdf4';
            statusBox.style.borderColor = '#bbf7d0';
            statusBox.style.color = '#166534';
            statusBox.innerHTML = `
              <div style="font-weight: 700; margin-bottom: 0.2rem;"><i class="fa-solid fa-circle-check"></i> You're all set!</div>
              <div>Click the button below to confirm your session booking.</div>
            `;
          }
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
          }
        }
      } catch (e) {
        console.error('Wallet balance fetch error:', e);
      }
    },

    async confirmBooking() {
      const confirmBtn = document.getElementById('btnConfirmBooking');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Confirming & Deducting Credits...`;
      }

      try {
        const payload = {
          mentorId: this.bookingState.mentor?.id,
          subject: this.bookingState.subject,
          topic: this.bookingState.topic,
          date: this.bookingState.date,
          time: this.bookingState.time,
          durationHours: this.bookingState.durationHours,
          title: this.bookingState.title,
          description: this.bookingState.description,
          sessionType: this.bookingState.sessionType,
          meetingPlatform: this.bookingState.meetingPlatform,
          additionalNotes: this.bookingState.additionalNotes
        };

        const res = await fetch('/api/booking/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${window.store.token}`
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        // Check for 409 Double-Booking Conflict
        if (res.status === 409) {
          alert('⚠️ This time slot was just booked by another student. Please select a different time slot.');
          this.navigateToBookingStep(3);
          return;
        }

        if (!res.ok) {
          throw new Error(data.message || 'Booking confirmation failed');
        }

        this.bookingState.bookingResult = data.session;

        // Update wallet in store
        if (data.wallet) {
          window.store.wallet = data.wallet;
          const curUser = window.store.getCurrentPersona();
          if (curUser) curUser.credits = data.wallet.balance;
          this.renderNavbar();
        }

        await window.store.fetchSessions();
        this.showToast(`🎉 Session booked! ${data.session?.credits || this.bookingState.creditsRequired} Credits held in Escrow.`, 'check');

        // Transition to Step 6 (Booking Success)
        this.navigateToBookingStep(6);
      } catch (err) {
        alert('Booking error: ' + err.message);
      } finally {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = `<i class="fa-solid fa-check"></i> Confirm & Book Session`;
        }
      }
    },

    loadBookingSuccess() {
      const m = this.bookingState.mentor;
      const sess = this.bookingState.bookingResult;

      const succMentorName = document.getElementById('succMentorName');
      const succMentorBadge = document.getElementById('succMentorBadge');
      if (succMentorName) succMentorName.textContent = m?.name || 'Mentor';
      if (succMentorBadge) succMentorBadge.textContent = m?.tier || 'Elite Mentor';

      const succSubj = document.getElementById('succSubject');
      const succTop = document.getElementById('succTopic');
      if (succSubj) succSubj.textContent = this.bookingState.subject || 'Subject';
      if (succTop) succTop.textContent = this.bookingState.topic || 'General Discussion';

      const succDate = document.getElementById('succDateTime');
      const succRange = document.getElementById('succTimeRange');
      if (succDate) {
        let dateFormatted = this.bookingState.date || 'Today';
        try {
          const d = new Date(this.bookingState.date + 'T00:00:00');
          dateFormatted = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) { }
        succDate.textContent = dateFormatted;
      }
      if (succRange) {
        const hours = this.bookingState.durationHours;
        const durStr = hours === 0.5 ? '30 mins' : hours === 1 ? '1 hour' : `${hours} hours`;
        succRange.textContent = `${this.bookingState.time || '05:00 PM'} (${durStr})`;
      }

      const succPlat = document.getElementById('succPlatform');
      if (succPlat) succPlat.textContent = this.bookingState.meetingPlatform || 'Google Meet';

      // Clear cached booking draft
      sessionStorage.removeItem('skillswap_booking_flow');
    },

    downloadBookingCalendarIcs() {
      const sess = this.bookingState.bookingResult || {};
      const mentor = this.bookingState.mentor || {};
      const date = this.bookingState.date || new Date().toISOString().split('T')[0];
      const time = this.bookingState.time || '05:00 PM';
      const title = this.bookingState.title || 'SkillSwap 1-on-1 Learning Session';
      const description = this.bookingState.description || 'Peer learning and doubt clearing session on SkillSwap University Hub.';

      // Generate RFC 5545 iCalendar content
      const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const cleanDate = date.replace(/-/g, '');
      const icsLines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SkillSwap University Hub//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        `UID:sess-${sess.id || Date.now()}@skillswap.university`,
        `DTSTAMP:${nowStr}`,
        `DTSTART;VALUE=DATE:${cleanDate}`,
        `DTEND;VALUE=DATE:${cleanDate}`,
        `SUMMARY:${title} with ${mentor.name || 'Mentor'}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${this.bookingState.meetingPlatform || 'Google Meet'}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      const blob = new Blob([icsLines], { type: 'text/calendar;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `skillswap-session-${sess.id || 'invite'}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast('📅 Calendar event invite (.ics) downloaded!', 'calendar-plus');
    },

    updateBookingSidebar() {
      const placeholder = document.getElementById('bookingSummaryPlaceholder');
      const activeContent = document.getElementById('bookingSummaryActiveContent');
      const m = this.bookingState.mentor;

      if (!m) {
        if (placeholder) placeholder.style.display = 'block';
        if (activeContent) activeContent.style.display = 'none';
        return;
      }

      if (placeholder) placeholder.style.display = 'none';
      if (activeContent) activeContent.style.display = 'block';

      const sideAvatar = document.getElementById('sideMentorAvatar');
      const sideName = document.getElementById('sideMentorName');
      const sideBadge = document.getElementById('sideMentorBadge');
      if (sideAvatar) sideAvatar.textContent = (m.name || 'M').substring(0, 2).toUpperCase();
      if (sideName) sideName.textContent = m.name;
      if (sideBadge) sideBadge.textContent = m.tier || 'Elite Mentor';

      const sideSubj = document.getElementById('sideSubjectText');
      if (sideSubj) {
        if (this.bookingState.subject) {
          sideSubj.textContent = this.bookingState.topic ? `${this.bookingState.subject} (${this.bookingState.topic})` : this.bookingState.subject;
          sideSubj.style.color = '#0f172a';
          sideSubj.style.fontWeight = '600';
        } else {
          sideSubj.textContent = 'Not selected yet';
          sideSubj.style.color = '#64748b';
          sideSubj.style.fontWeight = '400';
        }
      }

      const sideDateTime = document.getElementById('sideDateTimeText');
      if (sideDateTime) {
        if (this.bookingState.date && this.bookingState.time) {
          let dateFormatted = this.bookingState.date;
          try {
            const d = new Date(this.bookingState.date + 'T00:00:00');
            dateFormatted = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          } catch (e) { }
          sideDateTime.textContent = `${dateFormatted} • ${this.bookingState.time}`;
          sideDateTime.style.color = '#0f172a';
          sideDateTime.style.fontWeight = '600';
        } else {
          sideDateTime.textContent = 'Not selected yet';
          sideDateTime.style.color = '#64748b';
          sideDateTime.style.fontWeight = '400';
        }
      }

      const hours = this.bookingState.durationHours || 1;
      const rate = m.rate || 2.5;
      const credits = (hours * rate).toFixed(1);

      const sideDur = document.getElementById('sideDurationText');
      if (sideDur) sideDur.textContent = hours === 0.5 ? '30 Minutes' : hours === 1 ? '1 Hour' : `${hours} Hours`;

      const sideCred = document.getElementById('sideCreditsText');
      if (sideCred) sideCred.textContent = `${credits} Credits`;
    },

    handleInitialRouting(pushHistory = false) {
      const path = window.location.pathname;
      const hash = window.location.hash;

      // Add Subject / Skill route: /add-subject or /assessment/add-subject or #add-subject
      if (path === '/add-subject' || hash === '#/add-subject' || hash === '#add-subject' || path === '/assessment/add-subject' || hash === '#/assessment/add-subject') {
        this.switchView('view-quizzes');
        this.openAddSkillModal('offered');
        return;
      }

      // Assessment view route: /quizzes or /assessment or #view-quizzes
      if (path === '/assessment' || hash === '#/assessment' || hash === '#view-quizzes' || path === '/quizzes' || hash === '#/quizzes') {
        this.switchView('view-quizzes');
        return;
      }

      // Masterclass details route: /sessions/masterclass/:id
      const mcDetailsMatch = path.match(/^\/sessions\/masterclass\/([a-zA-Z0-9_\-]+)$/) ||
        hash.match(/^#\/sessions\/masterclass\/([a-zA-Z0-9_\-]+)$/);
      if (mcDetailsMatch && mcDetailsMatch[1] !== 'create') {
        this.openMasterclassDetailsPage(mcDetailsMatch[1], pushHistory);
        return;
      }

      // Masterclass edit route: /sessions/masterclass/:id/edit
      const mcEditMatch = path.match(/^\/sessions\/masterclass\/([a-zA-Z0-9_\-]+)\/edit$/) ||
        hash.match(/^#\/sessions\/masterclass\/([a-zA-Z0-9_\-]+)\/edit$/);
      if (mcEditMatch) {
        this.openEditMasterclass(mcEditMatch[1]);
        return;
      }

      // Masterclass reschedule route: /sessions/masterclass/:id/reschedule
      const mcRescheduleMatch = path.match(/^\/sessions\/masterclass\/([a-zA-Z0-9_\-]+)\/reschedule$/) ||
        hash.match(/^#\/sessions\/masterclass\/([a-zA-Z0-9_\-]+)\/reschedule$/);
      if (mcRescheduleMatch) {
        this.openRescheduleModal(mcRescheduleMatch[1]);
        return;
      }

      if (path === '/sessions/masterclass/create' || hash === '#/sessions/masterclass/create' || hash === '#create-masterclass') {
        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('edit');
        if (editId) {
          this.openEditMasterclass(editId);
        } else {
          this.openCreateMasterclassPage(pushHistory);
        }
        return;
      }

      if (path.startsWith('/sessions/book/') || hash.startsWith('#/sessions/book/')) {
        const sub = path.startsWith('/sessions/book/') ? path.replace('/sessions/book/', '') : hash.replace('#/sessions/book/', '');
        const stepMap = {
          'mentor': 1,
          'subject': 2,
          'date-time': 3,
          'details': 4,
          'review': 5,
          'success': 6
        };
        const stepNum = stepMap[sub] || 1;
        this.navigateToBookingStep(stepNum, pushHistory);
        return;
      }
    },

    async openMasterclassDetailsPage(sessionId, pushHistory = true) {
      if (pushHistory) {
        history.pushState({ view: 'masterclass-details', sessionId }, '', '/sessions/masterclass/' + sessionId);
      }
      this.switchView('view-masterclass-details');

      const loadingEl = document.getElementById('mcDetailsLoadingState');
      const errorEl = document.getElementById('mcDetailsErrorState');
      const mainEl = document.getElementById('mcDetailsMainContainer');

      if (loadingEl) loadingEl.style.display = 'block';
      if (errorEl) errorEl.style.display = 'none';
      if (mainEl) mainEl.style.display = 'none';

      try {
        const sess = await window.store.getSessionDetails(sessionId);
        if (!sess) throw new Error('Masterclass session not found');

        if (loadingEl) loadingEl.style.display = 'none';
        if (mainEl) mainEl.style.display = 'block';

        const currentPersona = window.store.getCurrentPersona() || {};
        const isHost = sess.teacher_id === currentPersona.id;
        const attendees = sess.attendees || [];
        const isEnrolled = attendees.some(a => a.student_id === currentPersona.id);
        const countN = sess.enrolled_count !== undefined ? sess.enrolled_count : attendees.length;
        const maxCapacity = sess.max_capacity || 30;
        const isFull = countN >= maxCapacity;

        // Title & Category
        const titleEl = document.getElementById('mcDetailsTitle');
        if (titleEl) titleEl.textContent = sess.topic || sess.skill || 'Masterclass';
        const subjCatEl = document.getElementById('mcDetailsSubjCat');
        if (subjCatEl) subjCatEl.textContent = `${sess.skill || 'Technology'} • ${sess.category || 'Peer Learning'}`;

        // Status Badge
        const statusBadge = document.getElementById('mcDetailsStatusBadge');
        if (statusBadge) {
          if (sess.status === 'Cancelled') {
            statusBadge.className = 'session-status-badge cancelled';
            statusBadge.textContent = '● Cancelled';
          } else if (sess.status === 'Completed' || sess.status === 'ATTENDANCE_FINALIZED') {
            statusBadge.className = 'session-status-badge completed';
            statusBadge.textContent = '● Completed';
          } else {
            statusBadge.className = 'session-status-badge confirmed';
            statusBadge.textContent = '● Upcoming';
          }
        }

        // Host Profile
        const hostName = sess.teacherName || sess.teacher?.name || 'Peer Mentor';
        const hostNameEl = document.getElementById('mcDetailsHostName');
        if (hostNameEl) hostNameEl.textContent = isHost ? 'You (Host)' : hostName;
        const hostRoleEl = document.getElementById('mcDetailsHostRole');
        if (hostRoleEl) hostRoleEl.textContent = isHost ? 'Organizer' : 'Peer Mentor';
        const hostAvatar = window.getStudentAvatar(sess.teacher_id);
        const hostImg = document.getElementById('mcDetailsHostAvatar');
        if (hostImg) {
          hostImg.src = hostAvatar;
          hostImg.onerror = () => window.handleAvatarError(hostImg, sess.teacher_id);
        }

        // About & Descriptions
        const shortDescEl = document.getElementById('mcDetailsShortDesc');
        if (shortDescEl) shortDescEl.textContent = sess.description || 'Interactive live group masterclass.';
        const fullDescEl = document.getElementById('mcDetailsFullDesc');
        if (fullDescEl) fullDescEl.textContent = sess.learning_details || sess.additional_notes || sess.description || 'Join this collaborative peer-led masterclass on SkillSwap University Hub.';

        // What You Will Learn checklist
        const learnListEl = document.getElementById('mcDetailsLearningList');
        if (learnListEl) {
          let learnItems = [];
          if (sess.learning_details) {
            learnItems = sess.learning_details.split(/\r?\n/).map(s => s.trim().replace(/^[-*•✓\d.]+\s*/, '')).filter(Boolean);
          }
          if (learnItems.length === 0) {
            learnItems = [
              `Comprehensive mastery of ${sess.skill || 'key concepts'} and fundamentals`,
              'Real-world problem solving techniques and best practices',
              'Interactive Q&A and direct hands-on exercises with the host',
              'Peer collaboration and code walkthroughs'
            ];
          }
          learnListEl.innerHTML = learnItems.map(item => `
            <div class="mc-learn-item" style="display: flex; align-items: flex-start; gap: 0.65rem; font-size: 0.92rem; color: #1e293b;">
              <i class="fa-solid fa-check" style="color: #059669; font-size: 1rem; margin-top: 2px;"></i>
              <span>${this.escapeHtml(item)}</span>
            </div>
          `).join('');
        }

        // Topics & Skills Tags
        const tagsContainer = document.getElementById('mcDetailsTagsContainer');
        if (tagsContainer) {
          let tagsList = [];
          if (Array.isArray(sess.tags)) tagsList = sess.tags;
          else if (typeof sess.tags === 'string') {
            try {
              const p = JSON.parse(sess.tags);
              if (Array.isArray(p)) tagsList = p;
              else tagsList = sess.tags.split(',').map(t => t.trim());
            } catch (e) {
              tagsList = sess.tags.split(',').map(t => t.trim());
            }
          }
          if (tagsList.length === 0) tagsList = [sess.skill || 'SkillSwap', 'Live Masterclass', 'Peer Learning'];
          tagsContainer.innerHTML = tagsList.filter(Boolean).map(t => `
            <span class="badge" style="background: #ede9fe; color: #6d28d9; padding: 0.35rem 0.8rem; border-radius: 9999px; font-weight: 600; font-size: 0.8rem;">
              #${this.escapeHtml(t)}
            </span>
          `).join('');
        }

        // Prerequisites
        const prereqEl = document.getElementById('mcDetailsPrereq');
        if (prereqEl) prereqEl.textContent = sess.prerequisites || 'No prior prerequisites required. Open to all students wishing to learn!';

        // Session Information Card
        const dateEl = document.getElementById('mcDetailsDate');
        if (dateEl) dateEl.textContent = sess.date || 'Scheduled Date';
        const timeEl = document.getElementById('mcDetailsTime');
        if (timeEl) timeEl.textContent = sess.time || '10:00 AM – 11:00 AM';
        const hours = sess.hours || 1;
        const durEl = document.getElementById('mcDetailsDuration');
        if (durEl) durEl.textContent = `${hours} Hour${hours > 1 ? 's' : ''}`;
        const capEl = document.getElementById('mcDetailsCapacity');
        if (capEl) capEl.textContent = `${maxCapacity} Students`;
        const regCountEl = document.getElementById('mcDetailsRegisteredCount');
        if (regCountEl) regCountEl.textContent = `${countN} / ${maxCapacity}`;
        const pct = Math.min(100, Math.round((countN / maxCapacity) * 100));
        const barEl = document.getElementById('mcDetailsCapacityBar');
        if (barEl) barEl.style.width = `${pct}%`;
        const platEl = document.getElementById('mcDetailsPlatform');
        if (platEl) platEl.textContent = sess.platform || sess.meeting_platform || 'Google Meet';
        const typeEl = document.getElementById('mcDetailsSeriesType');
        if (typeEl) typeEl.textContent = sess.session_series_type || 'One-time Masterclass';

        // Action Buttons Container
        const actionBtnContainer = document.getElementById('mcDetailsActionButtons');
        if (actionBtnContainer) {
          const isCompleted = sess.status === 'Completed' || sess.status === 'ATTENDANCE_FINALIZED';
          const isCancelled = sess.status === 'Cancelled';

          if (isCancelled) {
            actionBtnContainer.innerHTML = `
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 0.85rem; text-align: center; color: #991b1b; font-weight: 700;">
                <i class="fa-solid fa-ban"></i> This Masterclass Has Been Cancelled
              </div>
            `;
          } else if (isHost) {
            // Host Actions
            actionBtnContainer.innerHTML = `
              <button type="button" class="btn btn-dark" style="background: #0f172a; color: #fff; font-weight: 700; padding: 0.75rem;" onclick="window.app.openLiveRoom('${sess.id}')">
                <i class="fa-solid fa-video"></i> Enter Live Room
              </button>
              ${!isCompleted ? `
                <button type="button" class="btn btn-emerald" style="background: #059669; color: #fff; font-weight: 700; padding: 0.75rem;" onclick="window.app.concludeCohortSession('${sess.id}')">
                  <i class="fa-solid fa-flag-checkered"></i> Finalize Attendance & Release Rewards
                </button>
                <div style="display: flex; gap: 0.5rem;">
                  <button type="button" class="btn btn-outline" style="flex: 1; padding: 0.65rem;" onclick="window.app.openEditMasterclass('${sess.id}')">
                    <i class="fa-solid fa-pen-to-square"></i> Edit
                  </button>
                  <button type="button" class="btn btn-outline" style="flex: 1; padding: 0.65rem;" onclick="window.app.openRescheduleModal('${sess.id}')">
                    <i class="fa-solid fa-calendar-days"></i> Reschedule
                  </button>
                  <button type="button" class="btn btn-outline danger" style="flex: 1; padding: 0.65rem;" onclick="window.app.openCancelModal('${sess.id}')">
                    <i class="fa-solid fa-ban"></i> Cancel
                  </button>
                </div>
              ` : `
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.75rem; text-align: center; color: #166534; font-weight: 700;">
                  <i class="fa-solid fa-circle-check"></i> Masterclass Completed & Attendance Finalized
                </div>
              `}
              <button type="button" class="btn btn-outline btn-sm" style="margin-top: 0.5rem;" onclick="window.app.openReportIssueModal('${sess.id}')">
                <i class="fa-solid fa-flag"></i> Report Issue
              </button>
            `;
          } else {
            // Receiver Actions
            if (isCompleted) {
              actionBtnContainer.innerHTML = `
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.75rem; text-align: center; color: #166534; font-weight: 700; margin-bottom: 0.5rem;">
                  <i class="fa-solid fa-circle-check"></i> Masterclass Completed
                </div>
                <button type="button" class="btn btn-secondary" style="width: 100%; padding: 0.75rem;" onclick="window.app.openSessionDetailsModal('${sess.id}')">
                  View Session Summary
                </button>
                <button type="button" class="btn btn-outline btn-sm" style="margin-top: 0.5rem;" onclick="window.app.openReportIssueModal('${sess.id}')">
                  <i class="fa-solid fa-flag"></i> Report Issue
                </button>
              `;
            } else if (isEnrolled) {
              actionBtnContainer.innerHTML = `
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.75rem; text-align: center; color: #166534; font-weight: 700; margin-bottom: 0.5rem;">
                  <i class="fa-solid fa-circle-check"></i> Registered ✓
                </div>
                <button type="button" class="btn btn-dark" style="width: 100%; background: #0f172a; color: #fff; font-weight: 700; padding: 0.75rem;" onclick="window.app.openLiveRoom('${sess.id}')">
                  <i class="fa-solid fa-video"></i> Enter Live Session
                </button>
                <button type="button" class="btn btn-outline btn-sm" style="margin-top: 0.5rem;" onclick="window.app.openReportIssueModal('${sess.id}')">
                  <i class="fa-solid fa-flag"></i> Report Issue
                </button>
              `;
            } else {
              actionBtnContainer.innerHTML = `
                <button type="button" class="btn ${isFull ? 'btn-secondary' : 'btn-primary'}" style="width: 100%; padding: 0.85rem; font-size: 1rem; font-weight: 700;" ${isFull ? 'disabled' : ''} onclick="window.app.enrollInLiveCohort('${sess.id}')">
                  ${isFull ? '<i class="fa-solid fa-user-xmark"></i> Session Full' : '<i class="fa-solid fa-gift"></i> Join Masterclass — Free (0 Credits)'}
                </button>
                <p style="text-align: center; font-size: 0.78rem; color: #059669; font-weight: 600; margin: 0.4rem 0 0;">
                  <i class="fa-solid fa-circle-check"></i> Free Admission for Vignan University Students
                </p>
                <button type="button" class="btn btn-outline btn-sm" style="margin-top: 0.5rem;" onclick="window.app.openReportIssueModal('${sess.id}')">
                  <i class="fa-solid fa-flag"></i> Report Issue
                </button>
              `;
            }
          }
        }
      } catch (err) {
        console.error('Error loading masterclass details:', err);
        if (loadingEl) loadingEl.style.display = 'none';
        if (mainEl) mainEl.style.display = 'none';
        if (errorEl) {
          errorEl.style.display = 'block';
          const errMsgEl = document.getElementById('mcDetailsErrorMsg');
          if (errMsgEl) errMsgEl.textContent = err.message || 'Unable to load Masterclass details.';
        }
      }
    },

    setupMasterclassHoverTooltips() {
      const tooltip = document.getElementById('masterclassHoverTooltip');
      if (!tooltip) return;

      document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-mc-hover-id]');
        if (!target) return;
        const mcId = target.dataset.mcHoverId;
        const sess = (window.store.sessions || []).find(s => s.id === mcId);
        if (!sess) return;

        tooltip.innerHTML = `
          <div style="font-weight: 800; font-size: 0.92rem; color: #0f172a; margin-bottom: 0.25rem;">${this.escapeHtml(sess.topic || sess.skill)}</div>
          <div style="display: flex; gap: 0.4rem; align-items: center; font-size: 0.78rem; color: #2563eb; font-weight: 600; margin-bottom: 0.4rem;">
            <span><i class="fa-regular fa-calendar"></i> ${sess.date}</span>
            <span>•</span>
            <span><i class="fa-regular fa-clock"></i> ${sess.time || '10:00 AM'}</span>
          </div>
          <p style="margin: 0 0 0.4rem; font-size: 0.78rem; color: #475569; line-height: 1.4;">${this.escapeHtml(sess.description || 'Live interactive group masterclass.')}</p>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; border-top: 1px solid #f1f5f9; padding-top: 0.35rem;">
            <span style="color: #059669; font-weight: 700;"><i class="fa-solid fa-gift"></i> FREE TO JOIN</span>
            <span style="color: #64748b;">${sess.enrolled_count || 0} / ${sess.max_capacity || 30} Enrolled</span>
          </div>
        `;
        tooltip.style.display = 'block';
      });

      document.addEventListener('mousemove', (e) => {
        if (tooltip.style.display === 'block') {
          const x = Math.min(window.innerWidth - 300, e.clientX + 16);
          const y = Math.min(window.innerHeight - 180, e.clientY + 16);
          tooltip.style.left = `${x}px`;
          tooltip.style.top = `${y}px`;
        }
      });

      document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('[data-mc-hover-id]');
        if (target && !target.contains(e.relatedTarget)) {
          tooltip.style.display = 'none';
        }
      });
    },

    async acceptSwapSession(sessionId) {
      const activeBtn = document.activeElement;
      let origHtml = '';
      if (activeBtn && activeBtn.tagName === 'BUTTON') {
        origHtml = activeBtn.innerHTML;
        activeBtn.disabled = true;
        activeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Accepting...';
      }

      try {
        const res = await window.store.acceptSession(sessionId);
        this.showToast('🎉 Session Request Accepted! The session is now confirmed.', 'check');
        await window.store.fetchSessions();
        await window.store.fetchMySessions();
        await window.store.fetchWallet();
        this.renderNavbar();
        await this.renderSessions();
      } catch (err) {
        if (err.status === 409 || (err.message && err.message.includes('already'))) {
          alert('⚠️ This session request has already been accepted, cancelled, or declined.');
        } else {
          alert('Unable to accept this request: ' + err.message);
        }
        await window.store.fetchSessions();
        await window.store.fetchMySessions();
        await this.renderSessions();
      } finally {
        if (activeBtn && activeBtn.tagName === 'BUTTON') {
          activeBtn.disabled = false;
          activeBtn.innerHTML = origHtml || '<i class="fa-solid fa-check"></i> Accept Session';
        }
      }
    },

    async openDeclineModal(sessionId, sessionTitle) {
      const cats = window.store.categorizedSessions || {};
      let sess = (window.store.sessions || []).find(s => s.id === sessionId) ||
        (cats.all || []).find(s => s.id === sessionId) ||
        (cats.requests || []).find(s => s.id === sessionId);

      if (!sess) {
        try {
          sess = await window.store.getSessionDetails(sessionId);
        } catch (e) { }
      }

      const studentName = sess?.studentName || sess?.student?.name || 'Student';
      const idInput = document.getElementById('declineSessionId');
      const titleEl = document.getElementById('declineModalHeaderTitle');
      const questionEl = document.getElementById('declineConfirmQuestion');
      const sessionTitleEl = document.getElementById('declineSessionTitle');
      const reasonInput = document.getElementById('declineSessionReasonInput');
      const keepBtn = document.getElementById('keepDeclineSessionBtn');
      const confirmBtn = document.getElementById('confirmDeclineSessionBtn');

      if (idInput) idInput.value = sessionId;
      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-xmark"></i> Decline this session request?';
      if (questionEl) questionEl.innerHTML = `Are you sure you want to decline this request from <strong>${this.escapeHtml(studentName)}</strong>?`;
      if (sessionTitleEl) sessionTitleEl.textContent = studentName;
      if (keepBtn) keepBtn.textContent = 'Keep Request';
      if (confirmBtn) confirmBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Yes, Decline';
      if (reasonInput) reasonInput.value = '';

      this.openModal('declineSessionRequestModal');
    },

    async confirmDeclineSession() {
      const sessionId = document.getElementById('declineSessionId')?.value;
      const reason = document.getElementById('declineSessionReasonInput')?.value?.trim();
      if (!sessionId) return;

      const confirmBtn = document.getElementById('confirmDeclineSessionBtn');
      const origHtml = confirmBtn ? confirmBtn.innerHTML : '';
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Declining...';
      }

      try {
        await window.store.declineSession(sessionId, reason);
        this.closeModal('declineSessionRequestModal');
        this.restorePageScroll();
        this.showToast('Session request declined. Student escrow credits refunded.', 'info');
        await window.store.fetchSessions();
        await window.store.fetchMySessions();
        await window.store.fetchWallet();
        this.renderNavbar();
        await this.renderSessions();
      } catch (err) {
        this.closeModal('declineSessionRequestModal');
        this.restorePageScroll();
        alert('Unable to decline this request: ' + err.message);
      } finally {
        this.restorePageScroll();
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = origHtml || '<i class="fa-solid fa-xmark"></i> Yes, Decline';
        }
      }
    },

    async openFinalizeSwapModal(sessionId) {
      try {
        let sess = (window.store.sessions || []).find(s => s.id === sessionId);
        if (!sess) sess = await window.store.getSessionDetails(sessionId);
        if (!sess) return;

        const idInput = document.getElementById('finalizeSwapSessionId');
        const titleEl = document.getElementById('finalizeSwapSessionTitle');
        const infoEl = document.getElementById('finalizeSwapStudentInfo');
        const rewEl = document.getElementById('finalizeSwapRewardAmount');

        if (idInput) idInput.value = sessionId;
        if (titleEl) titleEl.textContent = sess.topic || sess.skill;
        const studentName = sess.studentName || sess.student?.name || 'Student';
        if (infoEl) infoEl.textContent = `Student: ${studentName} • Scheduled: ${sess.date} @ ${sess.time}`;
        const reward = ((sess.hours || 1) * (sess.rate || 2.5)).toFixed(1);
        if (rewEl) rewEl.textContent = `+${reward} Credits`;

        this.openModal('finalizeSwapAttendanceModal');
      } catch (err) {
        alert('Error opening attendance modal: ' + err.message);
      }
    },

    async confirmFinalizeSwapAttendance() {
      const sessionId = document.getElementById('finalizeSwapSessionId')?.value;
      const radio = document.querySelector('input[name="swapAttendanceStatusRadio"]:checked');
      const attendanceStatus = radio ? radio.value : 'Attended';
      if (!sessionId) return;

      const confirmBtn = document.getElementById('confirmFinalizeSwapBtn');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Finalizing...';
      }

      try {
        const res = await window.store.finalizeSwapAttendance(sessionId, attendanceStatus);
        this.closeModal('finalizeSwapAttendanceModal');
        if (res.alreadyFinalized) {
          this.showToast(`ℹ️ Session attendance already finalized. Reward: +${res.rewardCredits || 0} Credits.`, 'circle-info');
        } else if (attendanceStatus === 'Attended') {
          this.showToast(`🎉 Session Completed! You earned +${res.rewardCredits} Credits added to your wallet!`, 'award');
        } else {
          this.showToast(`Attendance recorded: Student did not attend. Escrow credits refunded.`, 'info');
        }
        await window.store.init();
        this.renderAll();
        await this.renderSessions();
      } catch (err) {
        alert('Error finalizing attendance: ' + err.message);
      } finally {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Finalize Attendance';
        }
      }
    },

    updateBookingCalculation() {
      const hours = Number(document.getElementById('bookDurationSelect').value);
      const rate = Number(document.getElementById('bookHourlyRate').value || 1.0);
      const total = (hours * rate).toFixed(1);
      const notice = document.getElementById('bookEscrowNotice');
      if (notice) {
        notice.innerHTML = `<strong>${hours} Hours &times; ${rate} Credits/hr = ${total} Credits</strong> will be locked in escrow. Your mentor receives credits only after the session concludes.`;
      }
    },

    // ==========================================
    // Multi-Persona & Multi-Role Authentication Handlers
    // ==========================================
    bindAuthEvents() {
      const authModal = document.getElementById('authModal');
      const openAuth = (defaultTab = 'authSignInTab') => {
        this.updateAuthModalJwtInspector();
        if (defaultTab) {
          document.querySelectorAll('.auth-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.authtab === defaultTab);
          });
          document.querySelectorAll('.auth-tab-pane').forEach(p => {
            p.style.display = p.id === defaultTab ? 'block' : 'none';
            p.classList.toggle('active', p.id === defaultTab);
          });
        }
        this.openModal('authModal');
      };

      const closeAuth = () => {
        this.closeModal('authModal');
        const loginErr = document.getElementById('loginErrorMsg');
        const regErr = document.getElementById('regErrorMsg');
        if (loginErr) loginErr.style.display = 'none';
        if (regErr) regErr.style.display = 'none';
      };

      // Navbar Triggers
      document.getElementById('navAuthBtn')?.addEventListener('click', () => {
        this.showEntrancePortal();
      });

      document.getElementById('dropdownLogoutBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('personaDropdown')?.classList.remove('show');
        window.store.logout();
        this.showEntrancePortal();
        this.showToast('Signed out successfully. Welcome to the Login Portal.', 'user');
      });

      document.getElementById('closeAuthModalBtn')?.addEventListener('click', closeAuth);
      document.getElementById('cancelAuthLoginBtn')?.addEventListener('click', closeAuth);
      document.getElementById('cancelAuthRegisterBtn')?.addEventListener('click', closeAuth);
      document.getElementById('closeAuthRolesBtn')?.addEventListener('click', closeAuth);

      // Single User Quick-Fill Button in Login Modal
      document.getElementById('authSingleUserQuickFillBtn')?.addEventListener('click', () => {
        const user = window.store.getCurrentPersona();
        const emailInput = document.getElementById('loginEmailInput');
        const passInput = document.getElementById('loginPasswordInput');
        if (user && user.email) {
          if (emailInput) emailInput.value = user.email;
          if (passInput) passInput.value = '';
          this.showToast(`Auto-filled registered email for ${user.name || 'User'}`, 'user');
        } else {
          this.showToast('Please enter your email and password to log in', 'info');
        }
      });

      // Auth Tabs Navigation
      document.querySelectorAll('.auth-tab-btn').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
          document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.auth-tab-pane').forEach(p => {
            p.classList.remove('active');
            p.style.display = 'none';
          });

          tabBtn.classList.add('active');
          const targetId = tabBtn.dataset.authtab;
          const targetPane = document.getElementById(targetId);
          if (targetPane) {
            targetPane.style.display = 'block';
            targetPane.classList.add('active');
          }
          if (targetId === 'authRolesTab') {
            this.updateAuthModalJwtInspector();
          }
        });
      });

      // Role Selection Cards in Registration Form
      document.querySelectorAll('.role-card-label').forEach(card => {
        card.addEventListener('click', () => {
          document.querySelectorAll('.role-card-label').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          const radio = card.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
        });
      });

      // Login Form Submit with Email & Password Pre-Verification
      const loginForm = document.getElementById('authLoginForm');
      loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('loginErrorMsg');
        if (errorBox) errorBox.style.display = 'none';

        const emailOrId = document.getElementById('loginEmailInput')?.value.trim();
        const password = document.getElementById('loginPasswordInput')?.value;
        const submitBtn = document.getElementById('submitLoginBtn');
        const origText = submitBtn ? submitBtn.innerHTML : '';

        // 1. Client-Side Email Verification
        if (!emailOrId) {
          if (errorBox) {
            errorBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Email Missing:</strong> Please enter your registered email or University ID.';
            errorBox.style.display = 'block';
          }
          this.showToast('Please enter your email or University ID', 'lock');
          return;
        }

        if (emailOrId.includes('@')) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(emailOrId)) {
            if (errorBox) {
              errorBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Invalid Email Format:</strong> Please enter a valid email address (e.g., student@vignan.ac.in).';
              errorBox.style.display = 'block';
            }
            this.showToast('Invalid email address format', 'lock');
            return;
          }
        }

        // 2. Client-Side Password Rule Verification
        if (!password) {
          if (errorBox) {
            errorBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Password Missing:</strong> Please enter your account password.';
            errorBox.style.display = 'block';
          }
          this.showToast('Please enter your password', 'lock');
          return;
        }

        if (!/^[A-Z]/.test(password)) {
          if (errorBox) {
            errorBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Password Verification Failed:</strong> Password must start with a capital letter (A-Z).';
            errorBox.style.display = 'block';
          }
          this.showToast('❌ Password must start with a capital letter (A-Z)', 'lock');
          return;
        }

        if (password.length < 6) {
          if (errorBox) {
            errorBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Password Verification Failed:</strong> Password must be at least 6 characters long.';
            errorBox.style.display = 'block';
          }
          this.showToast('❌ Password must be at least 6 characters long', 'lock');
          return;
        }

        if (submitBtn) {
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying email & password...';
          submitBtn.disabled = true;
        }

        try {
          const data = await window.store.login(emailOrId, password);
          if (submitBtn) {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
          }
          closeAuth();
          await this.renderAll();
          this.showToast(`✅ Email & password verified! Welcome back, ${data.user?.name}!`, 'check');
        } catch (err) {
          if (submitBtn) {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
          }
          if (errorBox) {
            errorBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${err.message || 'Authentication failed. Please check your credentials.'}`;
            errorBox.style.display = 'block';
          }
          this.showToast(err.message || 'Verification failed', 'lock');
        }
      });

      // Register Form Submit
      const regForm = document.getElementById('authRegisterForm');
      regForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('regErrorMsg');
        if (errorBox) errorBox.style.display = 'none';

        const name = document.getElementById('regNameInput').value.trim();
        const email = document.getElementById('regEmailInput').value.trim();
        const password = document.getElementById('regPasswordInput').value;
        const selectedRadio = document.querySelector('input[name="regRole"]:checked');
        const role = selectedRadio ? selectedRadio.value : 'STUDENT';
        const college = document.getElementById('regCollegeInput').value.trim();
        const major = document.getElementById('regMajorInput').value.trim();
        const bio = document.getElementById('regBioInput').value.trim();

        // Password Rule Validation: Starts with Capital Letter (A-Z) & Min 6 Characters
        if (!/^[A-Z]/.test(password)) {
          if (errorBox) {
            errorBox.textContent = '❌ Password rule violation: Password must start with a capital letter (A-Z).';
            errorBox.style.display = 'block';
          }
          this.showToast('❌ Password must start with a capital letter (A-Z)', 'lock');
          return;
        }

        if (password.length < 6) {
          if (errorBox) {
            errorBox.textContent = '❌ Password rule violation: Password must be at least 6 characters long.';
            errorBox.style.display = 'block';
          }
          this.showToast('❌ Password must be at least 6 characters long', 'lock');
          return;
        }

        const submitBtn = document.getElementById('submitRegisterBtn');
        const origText = submitBtn ? submitBtn.innerHTML : '';

        if (submitBtn) {
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registering Account...';
          submitBtn.disabled = true;
        }

        try {
          const data = await window.store.register({ name, email, password, role, college, major, bio });
          if (submitBtn) {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
          }
          closeAuth();
          await this.renderAll();
          this.showToast(`Welcome to SkillSwap, ${data.user?.name}! Logged in as ${data.user?.role} (+3.0 Welcome Credits).`, 'coins');
        } catch (err) {
          if (submitBtn) {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
          }
          if (errorBox) {
            errorBox.textContent = err.message || 'Registration failed.';
            errorBox.style.display = 'block';
          }
        }
      });

      // Re-verify JWT Session
      document.getElementById('refreshJwtBtn')?.addEventListener('click', async () => {
        await window.store.fetchMe();
        this.updateAuthModalJwtInspector();
        this.showToast('JWT signature verified with Express auth middleware!', 'check');
      });

      // Refresh Login Audit Logs
      document.getElementById('refreshLoginLogsBtn')?.addEventListener('click', () => {
        this.renderLoginHistoryLogs();
        this.showToast('Login audit logs reloaded from database!', 'check');
      });
    },

    updateAuthModalJwtInspector() {
      const token = window.store.token;
      const user = window.store.getCurrentPersona();
      const tokenDisplay = document.getElementById('jwtTokenDisplay');
      const claimsDisplay = document.getElementById('jwtClaimsDisplay');
      const indicator = document.getElementById('jwtStatusIndicator');

      if (token && tokenDisplay) {
        tokenDisplay.textContent = `Bearer ${token.substring(0, 28)}...${token.substring(token.length - 12)}`;
        if (indicator) {
          indicator.textContent = 'Active JWT Valid';
          indicator.style.color = 'var(--accent-emerald)';
        }
      } else if (tokenDisplay) {
        tokenDisplay.textContent = 'No active Bearer token';
        if (indicator) {
          indicator.textContent = 'Unauthenticated';
          indicator.style.color = 'var(--accent-rose)';
        }
      }

      if (claimsDisplay && user) {
        const role = user.role || (user.isAdmin ? 'ADMIN' : 'STUDENT');
        const roleClass = (role === 'ADMIN' || role === 'FACULTY_ADMIN' || role === 'SUPER_ADMIN') ? 'role-admin' : 'role-student';
        claimsDisplay.innerHTML = `User: <strong>${user.name}</strong> | Email: <strong>${user.email || user.id + '@vignan.ac.in'}</strong> | Role: <span class="auth-role-pill ${roleClass}">${role}</span> | Logins: <strong>${user.login_count || 1}</strong>`;
      }

      this.renderLoginHistoryLogs();
    },

    async renderLoginHistoryLogs() {
      const container = document.getElementById('loginHistoryListContainer');
      if (!container) return;

      container.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 0.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching database login audit records...</div>`;

      const logs = await window.store.fetchLoginHistory();
      if (!logs || logs.length === 0) {
        container.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 0.5rem;">No database login records found.</div>`;
        return;
      }

      container.innerHTML = logs.map(l => {
        const isSuccess = l.status === 'SUCCESS';
        const role = l.role || 'STUDENT';
        const timeStr = l.created_at ? new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now';
        const dateStr = l.created_at ? new Date(l.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Today';

        return `
          <div style="background: var(--bg-subtle); padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.74rem; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${isSuccess ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
            <div style="display: flex; flex-direction: column; gap: 0.1rem;">
              <div style="font-weight: 700; display: flex; align-items: center; gap: 0.35rem;">
                <span style="color: ${isSuccess ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${isSuccess ? '✓' : '✗'} ${l.status}</span>
                <span>•</span>
                <span style="color: var(--text-primary);">${l.email || l.user_id || 'Guest'}</span>
                <span class="auth-role-pill role-${role.toLowerCase().replace('_', '')}" style="font-size: 0.62rem; padding: 0.05rem 0.35rem;">${role}</span>
              </div>
              <div style="color: var(--text-muted); font-size: 0.68rem;">
                Method: ${l.auth_method || 'PASSWORD'} | IP: <code>${l.ip_address || '127.0.0.1'}</code> ${l.failure_reason ? `| Reason: <span style="color:var(--accent-rose);">${l.failure_reason}</span>` : ''}
              </div>
            </div>
            <div style="text-align: right; color: var(--text-muted); font-size: 0.68rem; font-family: monospace;">
              <div>${timeStr}</div>
              <div>${dateStr}</div>
            </div>
          </div>
        `;
      }).join('');
    },

    // ==========================================
    // Academic Support Team & Triage Handlers
    // ==========================================
    bindSupportEvents() {
      // Open Create Modal
      document.getElementById('openCreateSupportTicketBtn')?.addEventListener('click', () => {
        this.openCreateSupportModal();
      });
      document.getElementById('toolbarAskDoubtBtn')?.addEventListener('click', () => {
        this.openCreateSupportModal();
      });

      // Shortcut buttons to open Upload Doubt modal from other views
      document.getElementById('sessionsUploadDoubtBtn')?.addEventListener('click', () => {
        this.openCreateSupportModal();
      });
      document.getElementById('roomUploadDoubtBtn')?.addEventListener('click', () => {
        this.openCreateSupportModal();
      });

      // Close Create Modal
      document.getElementById('closeCreateSupportTicketModalBtn')?.addEventListener('click', () => {
        this.closeModal('createSupportTicketModal');
      });
      document.getElementById('cancelCreateSupportTicketBtn')?.addEventListener('click', () => {
        this.closeModal('createSupportTicketModal');
      });

      // Character Counter for Doubt Description
      const descInput = document.getElementById('supportDescriptionInput');
      const descCount = document.getElementById('doubtDescCharCount');
      descInput?.addEventListener('input', (e) => {
        if (descCount) descCount.textContent = e.target.value.length;
      });

      // Skill Selection Change -> Real-time Verification
      document.getElementById('supportSkillSelect')?.addEventListener('change', () => {
        this.checkSupportEligibilityLive();
      });

      // =========================================================
      // 1. STUDENT DOUBT ATTACHMENTS (Multi-file Drag & Drop)
      // =========================================================
      this.doubtAttachments = [];

      const doubtDropzone = document.getElementById('supportDropzone');
      const doubtFileInput = document.getElementById('supportAttachmentInput');

      const handleDoubtFiles = (fileList) => {
        if (!fileList || fileList.length === 0) return;
        for (let file of fileList) {
          if (file.size > 5 * 1024 * 1024) {
            alert(`File "${file.name}" exceeds the 5MB maximum limit. Please select a smaller file.`);
            continue;
          }
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64Data = event.target.result;
            this.doubtAttachments.push({
              id: 'local_dbt_att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              name: file.name,
              file_name: file.name,
              data: base64Data,
              file_data: base64Data,
              size: file.size,
              file_size: file.size,
              type: file.type || 'application/octet-stream',
              file_type: file.type || 'application/octet-stream'
            });
            this.renderDoubtUploadedFiles();
          };
          reader.readAsDataURL(file);
        }
      };

      doubtDropzone?.addEventListener('click', (e) => {
        if (e.target.closest('.file-card-action-btn')) return;
        doubtFileInput?.click();
      });

      doubtFileInput?.addEventListener('change', (e) => {
        handleDoubtFiles(e.target.files);
        doubtFileInput.value = '';
      });

      doubtDropzone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        doubtDropzone.style.borderColor = '#4f46e5';
        doubtDropzone.style.background = 'rgba(79, 70, 229, 0.08)';
      });

      doubtDropzone?.addEventListener('dragleave', () => {
        doubtDropzone.style.borderColor = 'rgba(99, 102, 241, 0.35)';
        doubtDropzone.style.background = 'rgba(99, 102, 241, 0.03)';
      });

      doubtDropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        doubtDropzone.style.borderColor = 'rgba(99, 102, 241, 0.35)';
        doubtDropzone.style.background = 'rgba(99, 102, 241, 0.03)';
        if (e.dataTransfer?.files) {
          handleDoubtFiles(e.dataTransfer.files);
        }
      });

      // Dynamic Subject Select Change Listener (reveals custom subject input)
      const skillSelect = document.getElementById('supportSkillSelect');
      const customGroup = document.getElementById('supportCustomSubjectGroup');
      const customInput = document.getElementById('supportCustomSkillInput');

      skillSelect?.addEventListener('change', (e) => {
        if (e.target.value === '__custom__') {
          if (customGroup) customGroup.style.display = 'block';
          if (customInput) {
            customInput.focus();
            customInput.required = true;
          }
        } else {
          if (customGroup) customGroup.style.display = 'none';
          if (customInput) {
            customInput.required = false;
            customInput.value = '';
          }
          this.checkSupportEligibilityLive();
        }
      });

      // Submit Create Doubt Ticket Form
      const createForm = document.getElementById('createSupportTicketForm');
      createForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        let selectedSkill = document.getElementById('supportSkillSelect').value;
        if (selectedSkill === '__custom__') {
          const customVal = document.getElementById('supportCustomSkillInput')?.value.trim();
          if (!customVal) {
            alert('Please enter your custom subject or course name.');
            return;
          }
          selectedSkill = customVal;
        }

        const title = document.getElementById('supportTitleInput').value.trim();
        const issueType = document.getElementById('supportIssueTypeSelect').value;
        const description = document.getElementById('supportDescriptionInput').value.trim();
        const codeSnippet = document.getElementById('supportCodeInput').value.trim();

        const submitBtn = document.getElementById('submitSupportTicketBtn');
        const origText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting Doubt...';
          submitBtn.disabled = true;
        }

        try {
          await window.store.createSupportTicket({
            skillName: selectedSkill,
            category: issueType,
            course: selectedSkill,
            title,
            issueType,
            description,
            codeSnippet,
            attachments: this.doubtAttachments
          });

          if (submitBtn) {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
          }

          this.closeModal('createSupportTicketModal');
          createForm.reset();
          if (customGroup) customGroup.style.display = 'none';
          this.doubtAttachments = [];
          this.renderDoubtUploadedFiles();
          const descCount = document.getElementById('doubtDescCharCount');
          if (descCount) descCount.textContent = '0';

          await this.refreshDynamicSupportSubjects();
          await this.renderSupportDesk();
          this.showToast(`🎉 Doubt for "${selectedSkill}" submitted to Support Hub! (Cost: 0 Cr)`, 'check');
        } catch (err) {
          if (submitBtn) {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
          }
          alert('Could not submit support ticket: ' + err.message);
        }
      });

      // =========================================================
      // 2. MENTOR ANSWER ATTACHMENTS (Multi-file Drag & Drop)
      // =========================================================
      this.answerAttachments = [];

      const answerDropzone = document.getElementById('resolveAnswerDropzone');
      const answerFileInput = document.getElementById('resolveAnswerAttachmentInput');

      const handleAnswerFiles = (fileList) => {
        if (!fileList || fileList.length === 0) return;
        for (let file of fileList) {
          if (file.size > 5 * 1024 * 1024) {
            alert(`File "${file.name}" exceeds 5MB limit. Please select a smaller file.`);
            continue;
          }
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64Data = event.target.result;
            this.answerAttachments.push({
              id: 'local_ans_att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              name: file.name,
              file_name: file.name,
              data: base64Data,
              file_data: base64Data,
              size: file.size,
              file_size: file.size,
              type: file.type || 'application/octet-stream',
              file_type: file.type || 'application/octet-stream'
            });
            this.renderAnswerUploadedFiles();
          };
          reader.readAsDataURL(file);
        }
      };

      answerDropzone?.addEventListener('click', (e) => {
        if (e.target.closest('.file-card-action-btn')) return;
        answerFileInput?.click();
      });

      answerFileInput?.addEventListener('change', (e) => {
        handleAnswerFiles(e.target.files);
        answerFileInput.value = '';
      });

      answerDropzone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        answerDropzone.style.borderColor = '#10b981';
        answerDropzone.style.background = 'rgba(16, 185, 129, 0.08)';
      });

      answerDropzone?.addEventListener('dragleave', () => {
        answerDropzone.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        answerDropzone.style.background = 'rgba(16, 185, 129, 0.03)';
      });

      answerDropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        answerDropzone.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        answerDropzone.style.background = 'rgba(16, 185, 129, 0.03)';
        if (e.dataTransfer?.files) {
          handleAnswerFiles(e.dataTransfer.files);
        }
      });

      // Character Counter for Solution Input
      const solutionInput = document.getElementById('resolveSolutionInput');
      const answerCount = document.getElementById('answerCharCount');
      solutionInput?.addEventListener('input', (e) => {
        if (answerCount) answerCount.textContent = e.target.value.length;
      });

      // Close Resolve Modal
      document.getElementById('closeResolveSupportModalBtn')?.addEventListener('click', () => {
        this.closeModal('resolveSupportModal');
      });
      document.getElementById('cancelResolveSupportBtn')?.addEventListener('click', () => {
        this.closeModal('resolveSupportModal');
      });

      // Complexity Option Click / Radio Change
      document.querySelectorAll('#resolveSupportModal .complexity-option').forEach(opt => {
        opt.addEventListener('click', () => {
          document.querySelectorAll('#resolveSupportModal .complexity-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          const radio = opt.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;

          const bounty = opt.dataset.bounty || '1.0';
          const level = opt.dataset.level || (radio ? radio.value : 'Level 1: Syntax / Typo / Quick Debug');
          this.selectedSupportComplexity = { level, bounty: parseFloat(bounty) };

          const display = document.getElementById('resolveBountyRewardDisplay');
          if (display) {
            display.textContent = `+${bounty} Credits`;
          }
        });
      });

      // Submit Resolve Form
      const resolveForm = document.getElementById('resolveSupportForm');
      resolveForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ticketId = document.getElementById('resolveTicketId').value;
        const selectedRadio = document.querySelector('input[name="supportComplexityRadio"]:checked');
        const classification = selectedRadio ? selectedRadio.value : this.selectedSupportComplexity.level;
        const solution = document.getElementById('resolveSolutionInput').value.trim();
        const recommendedQuizSkill = document.getElementById('resolveRecommendedQuizSelect').value;

        const submitBtn = document.getElementById('submitResolveSupportBtn');
        const origText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting Solution...';
          submitBtn.disabled = true;
        }

        try {
          const res = await window.store.resolveSupportTicket(ticketId, {
            classification,
            solution,
            attachments: this.answerAttachments,
            recommendedQuizSkill
          });

          if (submitBtn) {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
          }

          this.closeModal('resolveSupportModal');
          resolveForm.reset();
          this.answerAttachments = [];
          this.renderAnswerUploadedFiles();
          if (answerCount) answerCount.textContent = '0';

          await this.renderSupportDesk();
          await this.renderWallet();
          this.renderNavbar();
          this.showToast(`🎉 Solution submitted! +${res.rewardCredits || 1.5} Credits deposited into your wallet!`, 'coins');
        } catch (err) {
          if (submitBtn) {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
          }
          alert('Could not resolve ticket: ' + err.message);
        }
      });

      // Close Full Doubt Modal
      document.getElementById('closeFullDoubtModalBtn')?.addEventListener('click', () => {
        this.closeModal('viewFullDoubtModal');
      });
      document.getElementById('closeFullDoubtFooterBtn')?.addEventListener('click', () => {
        this.closeModal('viewFullDoubtModal');
      });

      // Close File Preview Modal
      document.getElementById('closeFilePreviewModalBtn')?.addEventListener('click', () => {
        this.closeModal('filePreviewModal');
      });

      // Copy Code inside Preview Modal
      document.getElementById('previewModalCopyCodeBtn')?.addEventListener('click', () => {
        if (this.currentPreviewCode) {
          navigator.clipboard.writeText(this.currentPreviewCode);
          this.showToast('✓ Code copied to clipboard!', 'check');
        }
      });

      // Support Filter Pills (Category & Status)
      document.querySelectorAll('#supportFilterPills .filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          document.querySelectorAll('#supportFilterPills .filter-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.supportFilter = pill.dataset.supportfilter || 'ALL';
          this.renderSupportDeskCards();
        });
      });

      // Support Quick Subject Filter Select
      document.getElementById('supportSubjectFilterSelect')?.addEventListener('change', (e) => {
        this.supportSubjectFilter = e.target.value || 'ALL';
        this.renderSupportDeskCards();
      });

      // Support Search Input with live keyword filtering
      document.getElementById('supportSearchInput')?.addEventListener('input', (e) => {
        this.supportSearchQuery = e.target.value.toLowerCase().trim();
        this.renderSupportDeskCards();
      });
    },

    // ==========================================
    // AI Dynamic Mentor Qualification & Skill Assessment Handlers
    // ==========================================
    bindQuizEvents() {
      const quizModal = document.getElementById('quizModal');
      document.getElementById('closeQuizModalBtn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to exit the assessment? Your progress will be lost.')) {
          clearInterval(this.quizTimerInterval);
          this.closeModal('quizModal');
        }
      });

      document.getElementById('quizNextBtn')?.addEventListener('click', () => {
        if (this.activeQuiz && this.currentQuestionIndex < this.activeQuiz.questions.length - 1) {
          this.currentQuestionIndex++;
          this.renderQuizQuestion();
        }
      });

      document.getElementById('quizPrevBtn')?.addEventListener('click', () => {
        if (this.activeQuiz && this.currentQuestionIndex > 0) {
          this.currentQuestionIndex--;
          this.renderQuizQuestion();
        }
      });

      const handleAssessmentSubmitClick = async () => {
        const answeredCount = Object.keys(this.userAnswers).filter(k => this.userAnswers[k] !== undefined && this.userAnswers[k] !== null).length;
        const total = this.activeQuiz?.questions?.length || this.selectedAssessmentCount || 20;
        if (answeredCount < total) {
          if (!confirm(`You have answered ${answeredCount} of ${total} questions. The remaining ${total - answeredCount} unattempted questions will receive 0 marks. Are you sure you want to submit and evaluate now?`)) {
            return;
          }
        }
        await this.submitAssessment();
      };

      // Dual Submit Options: Bottom Modal Button & Top Jump Matrix Header Button
      document.getElementById('quizSubmitBtn')?.addEventListener('click', handleAssessmentSubmitClick);
      document.getElementById('quizQuickSubmitBtn')?.addEventListener('click', handleAssessmentSubmitClick);

      // Generate & Start Assessment Button Binding
      document.getElementById('startConfiguredAssessmentBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.generateAndLaunchAssessment();
      });

      document.getElementById('quizCloseResultBtn')?.addEventListener('click', async () => {
        this.closeModal('quizModal');
        await this.renderAssessmentCenter();
        await this.renderAll();
      });

      // Assessment Subject Search Filter
      document.getElementById('assessmentSubjectSearchInput')?.addEventListener('input', (e) => {
        this.assessmentSearchQuery = (e.target.value || '').toLowerCase().trim();
        this.renderAssessmentSubjectsGrid();
      });

      // Question Count Pills (10, 20, 30, 40)
      document.querySelectorAll('#assessmentQuestionCountGroup .assessment-config-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#assessmentQuestionCountGroup .assessment-config-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.selectedAssessmentCount = parseInt(btn.dataset.count || '20', 10);
          this.updateAssessmentConfigPreview();
        });
      });

      // Difficulty Pills (Easy, Medium, Hard, Mixed)
      document.querySelectorAll('#assessmentDifficultyGroup .assessment-config-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#assessmentDifficultyGroup .assessment-config-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.selectedAssessmentDifficulty = btn.dataset.diff || 'Mixed';
          this.updateAssessmentConfigPreview();
        });
      });

      // Assessment Format / Type Pills
      document.querySelectorAll('#assessmentTypeGroup .assessment-config-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#assessmentTypeGroup .assessment-config-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.selectedAssessmentType = btn.dataset.type || 'Complete Mentor Assessment';
          this.updateAssessmentConfigPreview();
        });
      });
    },

    selectAssessmentSubject(skillName) {
      if (!skillName) return;
      this.selectedAssessmentSubject = skillName;
      this.renderAssessmentSubjectsGrid();
      this.updateAssessmentConfigPreview();
    },

    updateAssessmentConfigPreview() {
      const subjectName = this.selectedAssessmentSubject || (this.assessmentSubjects[0]?.skill_name) || 'Python Programming & DSA';
      const qCount = Number(this.selectedAssessmentCount) || 20;
      const diff = this.selectedAssessmentDifficulty || 'Mixed';
      const maxMarks = qCount * 3;
      const passMarks = Math.ceil(maxMarks * 0.70);
      const distMarks = Math.ceil(maxMarks * 0.90);
      const estTimeMins = Math.max(10, Math.ceil(qCount * 0.75));

      const titleEl = document.getElementById('assessmentConfigSelectedSubjectTitle');
      if (titleEl) titleEl.textContent = subjectName;

      const pillEl = document.getElementById('assessmentSelectedSubjectPill');
      if (pillEl) {
        const norm = subjectName.toLowerCase();
        let iconClass = 'fa-solid fa-code';
        if (norm.includes('java full stack') || norm.includes('java')) iconClass = 'fa-brands fa-java';
        else if (norm.includes('spring')) iconClass = 'fa-solid fa-leaf';
        else if (norm.includes('python')) iconClass = 'fa-brands fa-python';
        else if (norm.includes('react')) iconClass = 'fa-brands fa-react';
        else if (norm.includes('sql') || norm.includes('database')) iconClass = 'fa-solid fa-database';
        else if (norm.includes('security') || norm.includes('cyber')) iconClass = 'fa-solid fa-shield-halved';
        else if (norm.includes('design') || norm.includes('figma')) iconClass = 'fa-brands fa-figma';
        else if (norm.includes('ml') || norm.includes('ai') || norm.includes('machine learning') || norm.includes('data science')) iconClass = 'fa-solid fa-brain';
        else if (norm.includes('cloud') || norm.includes('devops') || norm.includes('docker') || norm.includes('kubernetes')) iconClass = 'fa-solid fa-cloud';
        else if (norm.includes('javascript') || norm.includes('js')) iconClass = 'fa-brands fa-js';
        else if (norm.includes('full stack')) iconClass = 'fa-solid fa-layer-group';
        pillEl.innerHTML = `<i class="${iconClass}"></i> <span>${this.escapeHtml(subjectName)}</span>`;
      }

      const totalMarksLabel = document.getElementById('assessmentConfigTotalMarksLabel');
      if (totalMarksLabel) totalMarksLabel.textContent = `${maxMarks} Marks (${qCount} \u00d7 3)`;

      const rulesTotalMarksPill = document.getElementById('assessmentRulesTotalMarksPill');
      if (rulesTotalMarksPill) rulesTotalMarksPill.innerHTML = `<i class="fa-solid fa-bullseye"></i> Total: ${maxMarks} Marks (${qCount} Qs \u00d7 3)`;

      const passThresholdEl = document.getElementById('assessmentRulePassThreshold');
      if (passThresholdEl) passThresholdEl.textContent = `${passMarks} / ${maxMarks} (70%)`;

      const distThresholdEl = document.getElementById('assessmentRuleDistThreshold');
      if (distThresholdEl) distThresholdEl.textContent = `${distMarks} / ${maxMarks} (90%)`;

      const previewTitle = document.getElementById('assessmentPreviewTitle');
      if (previewTitle) previewTitle.textContent = `${subjectName} Mentor Skill Assessment`;

      const previewQCount = document.getElementById('assessmentPreviewQCount');
      if (previewQCount) previewQCount.textContent = qCount;

      const previewDiff = document.getElementById('assessmentPreviewDiff');
      if (previewDiff) previewDiff.textContent = diff;

      const previewTime = document.getElementById('assessmentPreviewTime');
      if (previewTime) previewTime.textContent = estTimeMins;
    },

    renderAssessmentSubjectsGrid() {
      const grid = document.getElementById('assessmentSubjectsGrid');
      if (!grid) return;

      const subjects = (this.assessmentSubjects || []).filter(s => {
        if (!this.assessmentSearchQuery) return true;
        const q = this.assessmentSearchQuery;
        return (s.skill_name || '').toLowerCase().includes(q) ||
          (s.category || '').toLowerCase().includes(q) ||
          (s.name || '').toLowerCase().includes(q);
      });

      const countEl = document.getElementById('assessmentUserSubjectCount');
      if (countEl) {
        countEl.textContent = `${subjects.length} Eligible Course${subjects.length === 1 ? '' : 's'}`;
      }

      if (subjects.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-medium);">
            <i class="fa-solid fa-book-open-reader" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.5rem;"></i>
            <h4 style="font-weight: 800; color: var(--text-primary);">No Eligible Subjects Found</h4>
            <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 440px; margin: 0.25rem auto 1rem;">
              You can add new skills or courses to your profile anytime to unlock subject-specific qualification exams.
            </p>
            <button type="button" class="btn btn-primary btn-sm" id="assessmentEmptyAddSubjectBtn" onclick="window.app.openAddSkillModal('offered')" style="font-weight: 700; padding: 0.5rem 1.25rem;">
              <i class="fa-solid fa-circle-plus"></i> + Add Subject to Profile
            </button>
          </div>
        `;
        return;
      }

      grid.innerHTML = subjects.map(s => {
        const isSelected = this.selectedAssessmentSubject === s.skill_name;
        const hasPassed = (s.quiz_score || 0) >= 70;
        const isDistinction = (s.quiz_score || 0) >= 90;
        const tier = s.tier || (isDistinction ? 'Silver Tutor' : (hasPassed ? 'Bronze Tutor' : 'Peer Learner'));

        const norm = (s.skill_name || '').toLowerCase();
        let iconClass = 'fa-solid fa-code';
        let iconColor = 'var(--primary)';
        if (norm.includes('java full stack') || norm.includes('java')) {
          iconClass = 'fa-brands fa-java';
          iconColor = '#e76f51';
        } else if (norm.includes('spring')) {
          iconClass = 'fa-solid fa-leaf';
          iconColor = '#2a9d8f';
        } else if (norm.includes('python')) {
          iconClass = 'fa-brands fa-python';
          iconColor = '#3b82f6';
        } else if (norm.includes('react')) {
          iconClass = 'fa-brands fa-react';
          iconColor = '#06b6d4';
        } else if (norm.includes('javascript') || norm.includes('js')) {
          iconClass = 'fa-brands fa-js';
          iconColor = '#eab308';
        } else if (norm.includes('sql') || norm.includes('database')) {
          iconClass = 'fa-solid fa-database';
          iconColor = '#6366f1';
        } else if (norm.includes('security') || norm.includes('cyber')) {
          iconClass = 'fa-solid fa-shield-halved';
          iconColor = '#ef4444';
        } else if (norm.includes('design') || norm.includes('figma')) {
          iconClass = 'fa-brands fa-figma';
          iconColor = '#a855f7';
        } else if (norm.includes('ml') || norm.includes('machine learning') || norm.includes('ai') || norm.includes('data science')) {
          iconClass = 'fa-solid fa-brain';
          iconColor = '#10b981';
        } else if (norm.includes('cloud') || norm.includes('devops') || norm.includes('docker') || norm.includes('kubernetes')) {
          iconClass = 'fa-solid fa-cloud';
          iconColor = '#0ea5e9';
        } else if (norm.includes('full stack')) {
          iconClass = 'fa-solid fa-layer-group';
          iconColor = '#6366f1';
        }

        return `
          <div class="assessment-subject-card ${isSelected ? 'selected' : ''}" onclick="window.app.selectAssessmentSubject('${this.escapeQuotes(s.skill_name)}')" style="cursor: pointer; position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
              <div style="display: flex; align-items: center; gap: 0.85rem;">
                <div style="width: 48px; height: 48px; border-radius: var(--radius-md); background: rgba(99, 102, 241, 0.08); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: ${iconColor}; flex-shrink: 0;">
                  <i class="${iconClass}"></i>
                </div>
                <div>
                  <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.2rem; line-height: 1.3;">
                    ${this.escapeHtml(s.skill_name)}
                  </h4>
                  <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.35rem;">
                    ${this.escapeHtml(s.category || 'Programming')} &bull; ${this.escapeHtml(s.level || 'Intermediate')}
                  </p>
                  <div>
                    <span class="tag-badge" style="font-size: 0.72rem; font-weight: 700; background: rgba(16, 185, 129, 0.12); color: #059669; border: 1px solid rgba(16, 185, 129, 0.3); padding: 0.2rem 0.55rem; border-radius: var(--radius-full);">
                      <i class="fa-solid fa-circle-check"></i> Eligible for Assessment
                    </span>
                  </div>
                </div>
              </div>
              <div style="font-size: 1.15rem; color: ${isSelected ? 'var(--primary)' : 'var(--text-muted)'}; flex-shrink: 0; padding-right: 0.35rem;">
                <i class="fa-solid ${isSelected ? 'fa-circle-check' : 'fa-chevron-right'}"></i>
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.65rem; margin-top: 0.75rem; border-top: 1px solid var(--border-subtle); font-size: 0.78rem;">
              <div>
                <span style="color: var(--text-muted);">Current Tier:</span>
                <strong style="color: ${hasPassed ? 'var(--accent-emerald)' : 'var(--text-primary)'};">${this.escapeHtml(tier)}</strong>
              </div>
              <div style="text-align: right;">
                <span style="color: var(--text-muted);">Top Score:</span>
                <strong style="color: ${hasPassed ? 'var(--primary)' : 'var(--text-muted)'};">${s.quiz_score > 0 ? s.quiz_score + '%' : 'Not Attempted'}</strong>
              </div>
            </div>
          </div>
        `;
      }).join('');
    },

    async renderAssessmentHistory() {
      const tbody = document.getElementById('assessmentHistoryTableBody');
      if (!tbody) return;

      try {
        const history = await window.store.fetchAssessmentHistory();
        this.assessmentHistory = history || [];
      } catch (e) {
        this.assessmentHistory = [];
      }

      if (!this.assessmentHistory || this.assessmentHistory.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
              <i class="fa-solid fa-clipboard-check" style="font-size: 1.5rem; margin-bottom: 0.4rem; display: block;"></i>
              No assessment attempts recorded yet. Select a subject above and take your first qualification test!
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = this.assessmentHistory.map(a => {
        const isPassed = a.passed || a.score_percent >= 70;
        const isDist = a.score_percent >= 90;
        const totalQ = a.total_questions || 20;
        const maxM = a.max_marks || (totalQ * 3);
        const marksObt = a.marks_obtained !== undefined ? a.marks_obtained : Math.round((a.score_percent / 100) * maxM);
        const dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently';

        return `
          <tr>
            <td>
              <div style="font-weight: 800; color: var(--text-primary);">${this.escapeHtml(a.skill_name || 'Skill Assessment')}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${this.escapeHtml(a.category || 'Domain Assessment')}</div>
            </td>
            <td>
              <span class="tag-badge" style="font-weight: 700; font-size: 0.75rem;">
                <i class="fa-solid fa-list-ol"></i> ${totalQ} Qs
              </span>
            </td>
            <td>
              <span class="tag-badge" style="font-weight: 800; font-size: 0.78rem; background: ${isPassed ? (isDist ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)') : 'rgba(239, 68, 68, 0.15)'}; color: ${isPassed ? (isDist ? '#b45309' : '#059669') : '#dc2626'}; border: 1px solid ${isPassed ? (isDist ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)') : 'rgba(239, 68, 68, 0.4)'};">
                ${a.score_percent}% ${isDist ? '🏆 Distinction' : (isPassed ? '✓ Passed' : '✗ Failed')}
              </span>
            </td>
            <td>
              <strong style="color: var(--primary); font-family: monospace;">${marksObt} / ${maxM}</strong>
            </td>
            <td>
              <span style="font-weight: 700; color: var(--text-primary);">${this.escapeHtml(a.tier || (isPassed ? 'Bronze Tutor' : 'Unqualified'))}</span>
            </td>
            <td style="font-size: 0.78rem; color: var(--text-muted);">${dateStr}</td>
            <td style="text-align: right;">
              <button class="btn btn-secondary btn-sm" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;" onclick="window.app.generateAndLaunchAssessment('${this.escapeQuotes(a.skill_name)}')">
                <i class="fa-solid fa-rotate-right"></i> Retake
              </button>
            </td>
          </tr>
        `;
      }).join('');
    },

    async generateAndLaunchAssessment(customSkillName) {
      if (this._isGeneratingAssessment) {
        console.warn('[DEBUG] Assessment generation already in progress, ignoring duplicate call');
        return;
      }
      this._isGeneratingAssessment = true;

      console.log('[DEBUG] Generate Assessment clicked', { customSkillName });
      const skillName = customSkillName || this.selectedAssessmentSubject || (this.assessmentSubjects[0]?.skill_name) || 'Python Programming & DSA';
      const questionCount = Number(this.selectedAssessmentCount) || 20;
      const difficulty = this.selectedAssessmentDifficulty || 'Mixed';
      const assessmentType = this.selectedAssessmentType || 'Complete Mentor Assessment';

      console.log('[DEBUG] Existing handler started with parameters:', { skillName, questionCount, difficulty, assessmentType });

      const startBtn = document.getElementById('startConfiguredAssessmentBtn');
      const origBtnHtml = startBtn ? startBtn.innerHTML : '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate & Start Assessment';

      try {
        if (startBtn) {
          startBtn.disabled = true;
          startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating Exam...';
        }

        const quiz = await window.store.generateAssessment({
          skillName,
          questionCount,
          difficulty,
          assessmentType
        });

        console.log('[DEBUG] Assessment API response received:', quiz);

        if (!quiz || !quiz.questions || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
          throw new Error('Generated assessment is empty or missing questions array.');
        }

        this.activeQuiz = quiz;
        this.currentQuestionIndex = 0;
        this.userAnswers = {};
        this.quizTimerSeconds = (quiz.time_limit_minutes || Math.max(10, Math.ceil(questionCount * 0.75))) * 60;

        const maxMarks = questionCount * 3;
        const passMarks = Math.ceil(maxMarks * 0.70);
        const distMarks = Math.ceil(maxMarks * 0.90);

        const titleEl = document.getElementById('quizModalTitle');
        if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-award" style="color: var(--primary);"></i> ${quiz.title || (skillName + ' Qualification Exam')}`;

        const subtitleEl = document.getElementById('quizModalSubtitle');
        if (subtitleEl) subtitleEl.textContent = `• ${questionCount} Questions • ${quiz.time_limit_minutes || 15} Mins • Max: ${maxMarks} Marks • Pass: ≥70% (${passMarks}/${maxMarks}) • Distinction: ≥90% (${distMarks}/${maxMarks})`;

        const prevBtn = document.getElementById('quizPrevBtn');
        const nextBtn = document.getElementById('quizNextBtn');
        const submitBtn = document.getElementById('quizSubmitBtn');
        const quickSubmitBtn = document.getElementById('quizQuickSubmitBtn');
        const closeResultBtn = document.getElementById('quizCloseResultBtn');
        const headerBackBtn = document.getElementById('quizHeaderBackBtn');
        const backToHomeBtn = document.getElementById('quizBackToHomeBtn');
        const backToAssessmentsBtn = document.getElementById('quizBackToAssessmentsBtn');
        const retakeFromResultsBtn = document.getElementById('quizRetakeFromResultsBtn');

        if (headerBackBtn) headerBackBtn.style.display = 'none';
        if (backToHomeBtn) backToHomeBtn.style.display = 'none';
        if (backToAssessmentsBtn) backToAssessmentsBtn.style.display = 'none';
        if (retakeFromResultsBtn) retakeFromResultsBtn.style.display = 'none';
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) {
          nextBtn.style.display = questionCount > 1 ? 'inline-flex' : 'none';
          nextBtn.disabled = false;
        }
        if (submitBtn) {
          submitBtn.style.display = questionCount === 1 ? 'inline-flex' : 'none';
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit & Grade (+3 / -1 / 0)';
        }
        if (quickSubmitBtn) {
          quickSubmitBtn.disabled = false;
          quickSubmitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Assessment';
        }
        if (closeResultBtn) closeResultBtn.style.display = 'none';

        const qScreen = document.getElementById('quizQuestionsScreen');
        const rScreen = document.getElementById('quizResultScreen');
        if (qScreen) qScreen.style.display = 'block';
        if (rScreen) rScreen.style.display = 'none';

        this.renderQuizMatrix();
        this.renderQuizQuestion();
        this.startQuizTimer();
        this.openModal('quizModal');
        console.log('[DEBUG] Quiz modal opened and question 1 rendered successfully!');
      } catch (err) {
        console.error('[ERROR] generateAndLaunchAssessment error:', err);
        this.closeModal('quizModal');
        alert('Could not start AI assessment: ' + err.message);
      } finally {
        if (startBtn) {
          startBtn.disabled = false;
          startBtn.innerHTML = origBtnHtml;
        }
        this._isGeneratingAssessment = false;
      }
    },

    async startQuiz(skillName) {
      // Close active detail modals (e.g. Support Doubt Details or Session Details) so quiz opens cleanly
      ['viewFullDoubtModal', 'resolveSupportModal', 'createSupportTicketModal', 'sessionDetailsModal'].forEach(mId => {
        if (document.getElementById(mId)?.classList.contains('active')) {
          this.closeModal(mId);
        }
      });
      await this.generateAndLaunchAssessment(skillName);
    },

    async regenerateQuiz() {
      if (!this.activeQuiz) return;
      if (confirm(`Generate a brand-new set of dynamic AI questions for ${this.activeQuiz.skill_name || 'this subject'}? Your current answers will be reset.`)) {
        await this.generateAndLaunchAssessment(this.activeQuiz.skill_name);
        this.showToast('✨ Synthesized fresh dynamic AI assessment set!', 'wand-magic-sparkles');
      }
    },

    renderQuizMatrix() {
      const grid = document.getElementById('quizMatrixGrid');
      const counter = document.getElementById('quizAnsweredCountIndicator');
      if (!grid || !this.activeQuiz || !this.activeQuiz.questions) return;

      const total = this.activeQuiz.questions.length || 20;
      const answeredCount = Object.keys(this.userAnswers).filter(k => this.userAnswers[k] !== undefined && this.userAnswers[k] !== null).length;

      if (counter) {
        counter.textContent = `${answeredCount} / ${total} Answered`;
      }

      grid.innerHTML = this.activeQuiz.questions.map((_, idx) => {
        const isCurrent = idx === this.currentQuestionIndex;
        const isAnswered = this.userAnswers[idx] !== undefined && this.userAnswers[idx] !== null;
        let classes = 'quiz-matrix-btn';
        if (isCurrent) classes += ' active';
        if (isAnswered) classes += ' answered';

        return `
          <button type="button" class="${classes}" onclick="window.app.jumpToQuestion(${idx})" title="Question ${idx + 1}${isAnswered ? ' (Answered)' : ' (Unattempted)'}">
            ${idx + 1}
          </button>
        `;
      }).join('');
    },

    jumpToQuestion(index) {
      if (!this.activeQuiz || !this.activeQuiz.questions) return;
      if (index >= 0 && index < this.activeQuiz.questions.length) {
        this.currentQuestionIndex = index;
        this.renderQuizQuestion();
      }
    },

    renderQuizQuestion() {
      if (!this.activeQuiz || !this.activeQuiz.questions || this.activeQuiz.questions.length === 0) return;

      const total = this.activeQuiz.questions.length;
      const q = this.activeQuiz.questions[this.currentQuestionIndex];
      if (!q) return;

      // Update question index & progress bar
      const numIndicator = document.getElementById('quizQuestionNumberIndicator');
      if (numIndicator) {
        numIndicator.textContent = `Question ${this.currentQuestionIndex + 1} of ${total}`;
      }

      const progressBar = document.getElementById('quizProgressBar');
      if (progressBar) {
        const pct = ((this.currentQuestionIndex + 1) / total) * 100;
        progressBar.style.width = `${pct}%`;
      }

      // Update Question text and optional code snippet
      const qText = document.getElementById('quizQuestionText');
      if (qText) {
        qText.textContent = q.question;
      }

      const codeSnippet = document.getElementById('quizCodeSnippet');
      if (codeSnippet) {
        if (q.code_snippet && q.code_snippet.trim().length > 0) {
          codeSnippet.textContent = q.code_snippet;
          codeSnippet.style.display = 'block';
        } else {
          codeSnippet.style.display = 'none';
        }
      }

      // Render 4 options
      const optList = document.getElementById('quizOptionsList');
      if (optList && Array.isArray(q.options)) {
        const letters = ['A', 'B', 'C', 'D'];
        const selectedVal = this.userAnswers[this.currentQuestionIndex];

        optList.innerHTML = q.options.map((opt, optIdx) => {
          const isSelected = selectedVal === optIdx;
          return `
            <div class="quiz-option-item ${isSelected ? 'selected' : ''}" onclick="window.app.selectQuizOption(${optIdx})">
              <div class="option-radio-dot"></div>
              <span style="font-weight: 700; color: var(--primary); margin-right: 0.35rem;">${letters[optIdx] || optIdx + 1}.</span>
              <span>${this.escapeHtml(opt)}</span>
            </div>
          `;
        }).join('');
      }

      // Update Navigation buttons
      const prevBtn = document.getElementById('quizPrevBtn');
      const nextBtn = document.getElementById('quizNextBtn');
      const submitBtn = document.getElementById('quizSubmitBtn');

      if (prevBtn) {
        prevBtn.style.display = this.currentQuestionIndex > 0 ? 'inline-flex' : 'none';
      }
      if (nextBtn) {
        nextBtn.style.display = this.currentQuestionIndex < total - 1 ? 'inline-flex' : 'none';
      }
      if (submitBtn) {
        submitBtn.style.display = this.currentQuestionIndex === total - 1 ? 'inline-flex' : 'none';
      }

      // Re-sync matrix grid active/answered states
      this.renderQuizMatrix();

      // Ensure question screen is scrolled smoothly to top
      const qScreen = document.getElementById('quizQuestionsScreen');
      if (qScreen) qScreen.scrollTop = 0;
    },

    selectQuizOption(optionIndex) {
      this.userAnswers[this.currentQuestionIndex] = optionIndex;
      this.renderQuizQuestion();
    },

    clearCurrentAnswer() {
      delete this.userAnswers[this.currentQuestionIndex];
      this.renderQuizQuestion();
    },

    startQuizTimer() {
      if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
      const timerDisplay = document.getElementById('quizCountdownTimer');

      const updateTimer = () => {
        if (this.quizTimerSeconds <= 0) {
          clearInterval(this.quizTimerInterval);
          if (timerDisplay) timerDisplay.textContent = '00:00';
          this.showToast('⏰ Time is up! Submitting assessment for evaluation...', 'clock');
          this.submitAssessment();
          return;
        }

        const mins = Math.floor(this.quizTimerSeconds / 60);
        const secs = this.quizTimerSeconds % 60;
        if (timerDisplay) {
          timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        this.quizTimerSeconds--;
      };

      updateTimer();
      this.quizTimerInterval = setInterval(updateTimer, 1000);
    },

    closeQuizModalAndGoHome() {
      this.closeModal('quizModal');
      if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
      this.renderAll();
      this.switchView('view-matches');
      this.showToast('🏠 Returned to Home Dashboard (Smart Matches)', 'house');
    },

    closeQuizModalAndReturn() {
      this.closeModal('quizModal');
      if (this.quizTimerInterval) clearInterval(this.quizTimerInterval);
      this.renderAll();
      this.switchView('view-quizzes');
    },

    async retakeCurrentQuiz() {
      if (!this.activeQuiz) return;
      await this.generateAndLaunchAssessment(this.activeQuiz.skill_name || 'Python Programming & DSA');
    },

    async submitAssessment() {
      clearInterval(this.quizTimerInterval);
      const submitBtn = document.getElementById('quizSubmitBtn');
      const quickSubmitBtn = document.getElementById('quizQuickSubmitBtn');
      const origSubmitText = submitBtn ? submitBtn.innerHTML : '';
      const origQuickText = quickSubmitBtn ? quickSubmitBtn.innerHTML : '';
      const totalQ = this.activeQuiz?.questions?.length || 20;

      if (submitBtn) {
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Evaluating ${totalQ} Questions...`;
        submitBtn.disabled = true;
      }
      if (quickSubmitBtn) {
        quickSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Grading...';
        quickSubmitBtn.disabled = true;
      }

      try {
        const result = await window.store.submitQuiz(this.activeQuiz.id, this.userAnswers, this.activeQuiz.skill_name);

        document.getElementById('quizQuestionsScreen').style.display = 'none';
        const resScreen = document.getElementById('quizResultScreen');
        if (resScreen) {
          resScreen.style.display = 'block';
          resScreen.scrollTop = 0;
        }

        const quizModal = document.getElementById('quizModal');
        if (quizModal) quizModal.scrollTop = 0;

        document.getElementById('quizPrevBtn').style.display = 'none';
        document.getElementById('quizNextBtn').style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'none';

        // Show Back Buttons & Done / Retake Actions
        const headerBackBtn = document.getElementById('quizHeaderBackBtn');
        const backToHomeBtn = document.getElementById('quizBackToHomeBtn');
        const backToAssessmentsBtn = document.getElementById('quizBackToAssessmentsBtn');
        const retakeFromResultsBtn = document.getElementById('quizRetakeFromResultsBtn');
        const closeResultBtn = document.getElementById('quizCloseResultBtn');

        if (headerBackBtn) headerBackBtn.style.display = 'inline-flex';
        if (backToHomeBtn) backToHomeBtn.style.display = 'inline-flex';
        if (backToAssessmentsBtn) backToAssessmentsBtn.style.display = 'inline-flex';
        if (retakeFromResultsBtn) retakeFromResultsBtn.style.display = 'inline-flex';
        if (closeResultBtn) closeResultBtn.style.display = 'inline-flex';

        const scoreCircle = document.getElementById('quizScoreCircle');
        const scorePercent = document.getElementById('quizScorePercent');
        const marksDisplay = document.getElementById('quizMarksDisplay');
        const heading = document.getElementById('quizResultHeading');
        const subtext = document.getElementById('quizResultSubtext');
        const feedback = document.getElementById('quizFeedbackBox');

        const maxMarks = result.maxMarks || (totalQ * 3);
        const passMarks = Math.ceil(maxMarks * 0.70);

        // Output Marks & Percentage
        if (scorePercent) scorePercent.textContent = `${result.scorePercent}%`;
        if (marksDisplay) {
          marksDisplay.textContent = `${result.marksObtained} / ${maxMarks} Marks`;
        }

        // Output 4 Breakdown Cards
        const correctEl = document.getElementById('quizBreakdownCorrect');
        const wrongEl = document.getElementById('quizBreakdownWrong');
        const unattemptedEl = document.getElementById('quizBreakdownUnattempted');
        const netEl = document.getElementById('quizBreakdownNet');

        if (correctEl) correctEl.textContent = `${result.correctCount} (+${result.correctCount * 3})`;
        if (wrongEl) wrongEl.textContent = `${result.wrongCount} (-${result.wrongCount * 1})`;
        if (unattemptedEl) unattemptedEl.textContent = `${result.unattemptedCount} (0)`;
        if (netEl) netEl.textContent = `${result.marksObtained} / ${maxMarks}`;

        // ==========================================
        // Immediate Grade Allotment & Visual Banner
        // ==========================================
        const score = result.scorePercent !== undefined ? result.scorePercent : 0;
        const isPassed = result.passed;
        const hasCert = Boolean(result.hasCertificate || result.has_certificate || (window.store.getCurrentPersona()?.certificates || []).some(c => c.is_verified));

        let gradeKey = 'FAIL';
        let gradeTitle = 'GRADE ALLOTTED: FAIL (NOT PASSED)';
        let gradeIcon = '❌';
        let gradePill = 'FAIL (< 70%)';
        let gradeRate = '0.0 Cr/hr';
        let gradePillStyle = 'background: rgba(239, 68, 68, 0.2); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.4);';
        let gradeCardStyle = 'background: linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(239, 68, 68, 0.03) 100%); border: 1.5px solid rgba(239, 68, 68, 0.35);';
        let gradeColor = '#dc2626';
        let gradeDesc = `Your score of <strong>${result.marksObtained} Marks (${score}%)</strong> is below the passing requirement of ${passMarks} / ${maxMarks} Marks (70%). Your teaching badge remains unverified. Review your negative marking deductions below and click <strong>Retake Assessment</strong> when ready!`;

        if (isPassed) {
          if (score >= 90 && hasCert) {
            gradeKey = 'ELITE';
            gradeTitle = 'GRADE ALLOTTED: 🥇 ELITE MASTER TUTOR';
            gradeIcon = '🥇';
            gradePill = '🥇 4. ELITE MASTER';
            gradeRate = '2.5 Credits / hr';
            gradePillStyle = 'background: rgba(245, 158, 11, 0.25); color: #b45309; border: 1.5px solid #f59e0b;';
            gradeCardStyle = 'background: linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(217, 119, 6, 0.05) 100%); border: 2px solid #f59e0b; box-shadow: 0 4px 20px rgba(245, 158, 11, 0.18);';
            gradeColor = '#b45309';
            gradeDesc = `🎉 Outstanding Distinction! You scored <strong>${result.marksObtained} Marks (${score}%)</strong> with a verified external academic certificate. You have been immediately allotted the top tier: <strong>🥇 Elite Master Tutor (2.5 Cr/hr)</strong> for ${this.escapeHtml(this.activeQuiz?.skill_name || 'this subject')}!`;
          } else if (score >= 90) {
            gradeKey = 'SILVER_HIGH';
            gradeTitle = 'GRADE ALLOTTED: 🥈 SILVER TUTOR (DISTINCTION)';
            gradeIcon = '🥈';
            gradePill = '🥈 2. SILVER TUTOR';
            gradeRate = '1.5 Credits / hr';
            gradePillStyle = 'background: rgba(148, 163, 184, 0.25); color: #334155; border: 1.5px solid #94a3b8;';
            gradeCardStyle = 'background: linear-gradient(135deg, rgba(148, 163, 184, 0.18) 0%, rgba(100, 116, 139, 0.05) 100%); border: 2px solid #94a3b8; box-shadow: 0 4px 18px rgba(148, 163, 184, 0.15);';
            gradeColor = '#475569';
            gradeDesc = `🎉 Distinction Score Achieved! You scored <strong>${result.marksObtained} Marks (${score}%)</strong>. You have been allotted <strong>🥈 Silver Tutor (1.5 Cr/hr)</strong> for ${this.escapeHtml(this.activeQuiz?.skill_name || 'this subject')}. Link an NPTEL or other recognized certificate anytime to immediately upgrade to <strong>🥇 Elite Master (2.5 Cr/hr)</strong>!`;
          } else if (hasCert) {
            gradeKey = 'ADVANCED';
            gradeTitle = 'GRADE ALLOTTED: 🎖️ ADVANCED TUTOR';
            gradeIcon = '🎖️';
            gradePill = '🎖️ 3. ADVANCED TUTOR';
            gradeRate = '2.0 Credits / hr';
            gradePillStyle = 'background: rgba(14, 165, 233, 0.25); color: #0369a1; border: 1.5px solid #0ea5e9;';
            gradeCardStyle = 'background: linear-gradient(135deg, rgba(14, 165, 233, 0.18) 0%, rgba(2, 132, 199, 0.05) 100%); border: 2px solid #0ea5e9; box-shadow: 0 4px 18px rgba(14, 165, 233, 0.15);';
            gradeColor = '#0284c7';
            gradeDesc = `🎉 Assessment Passed with ${score}% + Verified Certificate linked! You have been allotted <strong>🎖️ Advanced Tutor (2.0 Cr/hr)</strong> for ${this.escapeHtml(this.activeQuiz?.skill_name || 'this subject')}!`;
          } else {
            gradeKey = 'BRONZE';
            gradeTitle = 'GRADE ALLOTTED: 🥉 BRONZE TUTOR';
            gradeIcon = '🥉';
            gradePill = '🥉 1. BRONZE TUTOR';
            gradeRate = '1.0 Credit / hr';
            gradePillStyle = 'background: rgba(205, 127, 50, 0.25); color: #854d0e; border: 1.5px solid #cd7f32;';
            gradeCardStyle = 'background: linear-gradient(135deg, rgba(205, 127, 50, 0.18) 0%, rgba(180, 83, 9, 0.05) 100%); border: 2px solid #cd7f32; box-shadow: 0 4px 18px rgba(205, 127, 50, 0.15);';
            gradeColor = '#854d0e';
            gradeDesc = `🎉 Assessment Passed! You scored <strong>${result.marksObtained} Marks (${score}%)</strong>. Your teaching badge is unlocked at <strong>🥉 Bronze Tutor (1.0 Cr/hr)</strong> for ${this.escapeHtml(this.activeQuiz?.skill_name || 'this subject')}. Score ≥90% or link a certificate to upgrade your tier!`;
          }
        }

        const gradeCardEl = document.getElementById('quizAllottedGradeCard');
        if (gradeCardEl) {
          gradeCardEl.style.cssText = `margin-bottom: 1.25rem; padding: 1.25rem; border-radius: var(--radius-lg); text-align: left; box-shadow: 0 4px 15px rgba(0,0,0,0.06); transition: all 0.3s ease; ${gradeCardStyle}`;
          gradeCardEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.5rem;">
              <div style="display: flex; align-items: center; gap: 0.65rem;">
                <span style="font-size: 1.75rem;">${gradeIcon}</span>
                <div>
                  <div style="font-size: 1.1rem; font-weight: 900; color: ${gradeColor}; letter-spacing: 0.3px;">${gradeTitle}</div>
                  <div style="font-size: 0.76rem; color: var(--text-muted); font-weight: 600;">Evaluated with Negative Marking • Stored in Database Records for ${this.escapeHtml(this.activeQuiz?.skill_name || 'Subject')}</div>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span style="font-size: 0.76rem; font-weight: 800; padding: 0.25rem 0.65rem; border-radius: var(--radius-full); ${gradePillStyle}">
                  ${gradePill}
                </span>
                <span style="font-size: 0.95rem; font-weight: 800; background: #0F172A; color: #FFFFFF; padding: 0.35rem 0.85rem; border-radius: var(--radius-full); border: 1px solid rgba(255,255,255,0.2);">
                  Rate: ${gradeRate}
                </span>
              </div>
            </div>
            <p style="font-size: 0.86rem; color: var(--text-primary); margin: 0.5rem 0 0; line-height: 1.48;">
              ${gradeDesc}
            </p>
            ${result.qualificationBonusAwarded ? `
              <div style="margin-top: 0.75rem; display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(16,185,129,0.15); border: 1.5px solid rgba(16,185,129,0.4); color: var(--accent-emerald); font-weight: 800; font-size: 0.8rem; padding: 0.35rem 0.75rem; border-radius: var(--radius-full);">
                <i class="fa-solid fa-coins"></i> +${result.bonusCredits || 2.0} Course Qualification Bonus Credited to Wallet!
              </div>
            ` : ''}
          `;
        }

        if (result.passed) {
          if (scoreCircle) scoreCircle.className = 'score-circle pass';
          const isHigh = result.scorePercent >= 90;
          if (heading) heading.innerHTML = isHigh ? `🏆 Distinction! (${result.marksObtained}/${maxMarks} Marks • ${result.scorePercent}%)` : `🎉 Passed Assessment (${result.marksObtained}/${maxMarks} Marks • ${result.scorePercent}%)`;
          let subtextMsg = `Evaluation Complete! Grade: <strong>${gradePill}</strong>. Result recorded in SQLite / Supabase database.`;
          if (result.qualificationBonusAwarded) {
            subtextMsg += `<br><div style="margin-top:0.65rem; padding:0.5rem 0.75rem; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); border-radius:8px; color:var(--accent-emerald); font-weight:700; display:inline-flex; align-items:center; gap:6px;">🎁 +${result.bonusCredits || 2.0} Course Qualification Bonus Credited to Wallet!</div>`;
            this.showToast(`🎉 Grade Allotted: ${gradePill}! +${result.bonusCredits || 2.0} Bonus Credits credited!`, 'award');
          } else {
            this.showToast(`Grade Allotted: ${gradePill} (${result.marksObtained}/${maxMarks} Marks)!`, 'check');
          }
          if (subtext) subtext.innerHTML = subtextMsg;
        } else {
          if (scoreCircle) scoreCircle.className = 'score-circle fail';
          if (heading) heading.innerHTML = `Assessment Not Passed (${result.marksObtained}/${maxMarks} Marks • ${result.scorePercent}%)`;
          if (subtext) subtext.innerHTML = `Grade: <strong style="color:var(--accent-rose);">FAIL</strong>. Passing requirement is ${passMarks} / ${maxMarks} Marks (70%). Review your answers below and click <strong>Back to Assessments</strong> or <strong>Retake Assessment</strong>.`;
        }

        // Render detailed review ledger with negative marking indicators
        if (feedback) {
          feedback.innerHTML = `
            <div style="font-size: 0.92rem; font-weight: 800; margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border-subtle); padding-bottom: 0.5rem;">
              <span>Exam Audit & Negative Marking Ledger (Database Synced):</span>
              <span style="color: var(--primary); font-family: monospace;">Net: ${result.marksObtained} / ${maxMarks} Marks</span>
            </div>
            ${(result.detailedResults || []).map((r, i) => {
            const markBadgeClass = r.isCorrect ? 'plus' : r.isWrong ? 'minus' : 'zero';
            const markBadgeText = r.isCorrect ? '+3 Marks' : r.isWrong ? '-1 Mark' : '0 Marks (Unattempted)';
            const userChoiceText = r.isUnattempted ? '<span style="color:var(--text-muted); font-style:italic;">Unattempted</span>' : `<span style="font-weight:700; color:${r.isCorrect ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${this.escapeHtml(r.options[r.userSelected] || 'None')}</span>`;

            return `
                <div style="margin-bottom: 0.85rem; font-size: 0.84rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.65rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                    <span style="font-weight: 700; color: ${r.isCorrect ? 'var(--accent-emerald)' : r.isWrong ? 'var(--accent-rose)' : 'var(--text-muted)'};">
                      ${r.isCorrect ? '✓ Correct' : r.isWrong ? '✗ Incorrect' : '⚪ Unattempted'} - Question ${i + 1}
                    </span>
                    <span class="mark-badge ${markBadgeClass}">${markBadgeText}</span>
                  </div>
                  <div style="font-weight: 600; margin-bottom: 0.35rem;">${this.escapeHtml(r.question)}</div>
                  ${r.code_snippet ? `<pre style="background: var(--bg-subtle); padding: 0.4rem; border-radius: 4px; font-size: 0.75rem; margin-bottom: 0.35rem;">${this.escapeHtml(r.code_snippet)}</pre>` : ''}
                  <div style="color: var(--text-secondary); margin: 0.2rem 0;">
                    Your Choice: ${userChoiceText} | Correct Answer: <strong>${this.escapeHtml(r.options[r.correctIndex])}</strong>
                  </div>
                  <div style="color: var(--text-muted); font-size: 0.76rem; background: var(--bg-card); padding: 0.35rem 0.5rem; border-radius: 4px; border-left: 2px solid var(--primary); margin-top: 0.25rem;">
                    💡 <strong>Explanation:</strong> ${this.escapeHtml(r.explanation)}
                  </div>
                </div>
              `;
          }).join('')}
          `;
        }

        // Refresh subjects and history in background
        this.renderAssessmentCenter().catch(() => { });
      } catch (err) {
        if (submitBtn) {
          submitBtn.innerHTML = origSubmitText;
          submitBtn.disabled = false;
        }
        if (quickSubmitBtn) {
          quickSubmitBtn.innerHTML = origQuickText;
          quickSubmitBtn.disabled = false;
        }
        alert('Error evaluating questions: ' + err.message);
      }
    },

    async submitSessionCompletion(sessionId, rating, comment, tags) {
      try {
        const res = await window.store.completeSessionAndReleaseEscrow(sessionId, rating, comment, tags);
        this.closeModal('reviewModal');
        await window.store.init();
        this.renderAll();
        this.showToast(`Credits transferred (${res.creditsTransferred || 5.0} Credits)! Rating updated from your feedback.`, 'coins');
        this.switchView('view-wallet');
      } catch (err) {
        alert(err.message);
      }
    },

    updateStarRatingUI(val) {
      document.querySelectorAll('#starRatingGroup .star-btn').forEach(star => {
        const sVal = Number(star.dataset.val);
        if (sVal <= val) {
          star.classList.add('fa-solid');
          star.classList.remove('fa-regular');
        } else {
          star.classList.remove('fa-solid');
          star.classList.add('fa-regular');
        }
      });
    },

    // ==========================================
    // Subpage & Modal Scroll Stack Management
    // ==========================================
    modalStack: [],

    restorePageScroll() {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.paddingRight = '';
    },

    openModal(modalOrId) {
      const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
      if (!modal) return;

      const modalId = modal.id || modalOrId;

      if (!this.modalStack) this.modalStack = [];
      this.modalStack = this.modalStack.filter(id => id !== modalId);
      this.modalStack.push(modalId);

      const baseZIndex = 50000;
      const computedZIndex = baseZIndex + (this.modalStack.length * 200);

      modal.style.zIndex = computedZIndex.toString();
      modal.classList.add('active');
      document.body.classList.add('modal-open');
      document.body.style.overflow = 'hidden';

      // Direct scrollbar directly to subpage modal container and reset top
      modal.scrollTop = 0;
      const modalContent = modal.querySelector('.modal-content, .modal-card, .support-modal-card');
      const modalBody = modal.querySelector('.modal-body');
      if (modalContent) modalContent.scrollTop = 0;
      if (modalBody) modalBody.scrollTop = 0;

      // Reset any inner sub-containers (e.g., Quiz screens, Auth screens)
      const scrollables = modal.querySelectorAll('#quizQuestionsScreen, #quizResultScreen, #quizFeedbackBox, #authLoginScreen, #authRegisterScreen');
      scrollables.forEach(el => { el.scrollTop = 0; });
    },

    closeModal(modalOrId) {
      if (!this.modalStack) this.modalStack = [];

      if (modalOrId) {
        const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
        if (modal) {
          modal.classList.remove('active');
          modal.style.zIndex = '';
          const modalId = modal.id || modalOrId;
          this.modalStack = this.modalStack.filter(id => id !== modalId);
          if (modalId === 'addSkillModal') {
            try {
              if (window.location.pathname === '/add-subject' && typeof history !== 'undefined' && history.pushState) {
                history.pushState({ view: 'quizzes' }, '', '/quizzes');
              }
            } catch (e) {}
          }
        }
      } else {
        const topId = this.modalStack.pop();
        if (topId) {
          const topModal = document.getElementById(topId);
          if (topModal) {
            topModal.classList.remove('active');
            topModal.style.zIndex = '';
          }
        }
      }

      const activeModals = document.querySelectorAll('.modal-overlay.active');
      if (activeModals.length === 0) {
        this.modalStack = [];
        this.restorePageScroll();
      } else {
        const lastActiveId = this.modalStack[this.modalStack.length - 1];
        if (lastActiveId) {
          const topRemaining = document.getElementById(lastActiveId);
          if (topRemaining) {
            topRemaining.style.zIndex = (50000 + (this.modalStack.length * 200)).toString();
          }
        }
      }
    },

    closeAllModals() {
      document.querySelectorAll('.modal-overlay.active').forEach(m => {
        m.classList.remove('active');
        m.style.zIndex = '';
      });
      this.modalStack = [];
      this.restorePageScroll();
    },

    openBookingModal(teacherId, skillName, hourlyRate = 2.5, tier = 'Elite Master') {
      this.startBookingFlow(teacherId, skillName, hourlyRate, tier);
    },

    openReviewModal(sessionId) {
      const session = (window.store.sessions || []).find(s => s.id === sessionId) || window.store.sessions[0];
      if (!session) return;
      document.getElementById('reviewSessionId').value = session.id;
      this.selectedRating = 5;
      this.updateStarRatingUI(5);
      document.getElementById('reviewCommentInput').value = '';
      this.openModal('reviewModal');
    },

    openAddSkillModal(type = 'offered') {
      const currentUser = window.store?.currentUser || window.store?.getCurrentPersona?.();
      const token = window.store?.token || localStorage.getItem('skillswap_auth_token') || localStorage.getItem('token') || localStorage.getItem('auth_token');
      const tokenExists = Boolean(token);
      const isAuth = Boolean(window.store?.isSessionActive?.() || (currentUser && currentUser.id !== 'guest'));
      const targetRoute = '/add-subject';

      console.log('[ADD SUBJECT DEBUG]');
      console.log('Current user:');
      console.log(currentUser?.name || currentUser?.id || 'guest');
      console.log('[ADD SUBJECT DEBUG]');
      console.log('Auth token exists:');
      console.log(tokenExists ? 'YES' : 'NO');
      console.log('[ADD SUBJECT DEBUG]');
      console.log('Auth state:');
      console.log(isAuth ? 'authenticated' : 'unauthenticated');
      console.log('[ADD SUBJECT DEBUG]');
      console.log('Target route:');
      console.log(targetRoute);

      if (!isAuth) {
        console.warn('[ADD SUBJECT DEBUG] User is unauthenticated. Prompting login portal.');
        this.showEntrancePortal();
        return;
      }

      // Verified authenticated: dismiss any stale login portal or auth modal
      document.body.classList.remove('portal-active');
      const portalOverlay = document.getElementById('entrancePortalOverlay');
      if (portalOverlay) {
        portalOverlay.classList.add('portal-hidden');
        portalOverlay.style.display = 'none';
      }
      this.closeModal('authModal');

      try {
        if (window.location.pathname !== targetRoute && typeof history !== 'undefined' && history.pushState) {
          history.pushState({ view: 'add-subject', type }, '', targetRoute);
        }
      } catch (e) {}

      document.getElementById('addSkillType').value = type;
      const title = document.getElementById('addSkillModalTitle');
      const descLabel = document.getElementById('skillDescLabel');
      const nameInput = document.getElementById('skillNameInput');
      const descInput = document.getElementById('skillDescInput');
      const charCounter = document.getElementById('skillDescCharCounter');

      // Ensure form view is visible and success view is hidden
      const formView = document.getElementById('addSkillModalFormView');
      const successView = document.getElementById('addSkillModalSuccessView');
      if (formView) formView.style.display = 'block';
      if (successView) successView.style.display = 'none';

      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      if (charCounter) charCounter.textContent = '0/500';

      const catSelect = document.getElementById('skillCategorySelect');
      if (catSelect) catSelect.value = 'Programming';
      const levelSelect = document.getElementById('skillLevelSelect');
      if (levelSelect) levelSelect.value = 'Intermediate';

      if (title) {
        if (type === 'offered') {
          title.innerHTML = `<i class="fa-solid fa-graduation-cap" style="color: var(--primary);"></i> Add Subject / Skill`;
          if (descLabel) descLabel.textContent = 'Description (Optional)';
          if (descInput) descInput.placeholder = 'Briefly describe your experience or interest in this subject.';
        } else {
          title.innerHTML = `<i class="fa-solid fa-bullseye" style="color: var(--accent-amber);"></i> Add Skill You Want to Learn`;
          if (descLabel) descLabel.textContent = 'Learning Goal & Target Output';
          if (descInput) descInput.placeholder = 'e.g. Build a portfolio project, master Figma components, prepare for exams...';
        }
      }

      this.openModal('addSkillModal');
    },

    quickFillPopularSubject(name, category, level, desc) {
      const nameInput = document.getElementById('skillNameInput');
      const catSelect = document.getElementById('skillCategorySelect');
      const levelSelect = document.getElementById('skillLevelSelect');
      const descInput = document.getElementById('skillDescInput');
      const charCounter = document.getElementById('skillDescCharCounter');

      if (nameInput) nameInput.value = name;
      if (catSelect) catSelect.value = category;
      if (levelSelect) levelSelect.value = level;
      if (descInput) {
        descInput.value = desc;
        if (charCounter) charCounter.textContent = desc.length + '/500';
      }

      if (nameInput) {
        nameInput.focus();
        nameInput.style.borderColor = 'var(--primary)';
        setTimeout(() => {
          if (nameInput) nameInput.style.borderColor = '';
        }, 800);
      }
    },

    async submitAddSkillForm() {
      const type = document.getElementById('addSkillType')?.value || 'offered';
      const name = document.getElementById('skillNameInput')?.value?.trim();
      const category = document.getElementById('skillCategorySelect')?.value || 'Programming';
      const level = document.getElementById('skillLevelSelect')?.value || 'Intermediate';
      const desc = document.getElementById('skillDescInput')?.value?.trim() || '';

      if (!name) return false;

      try {
        if (type === 'offered') {
          const res = await window.store.addSkillOffered({ name, category, level, description: desc, rate: 1.0 });
          this.lastAddedSubjectName = name;

          // Display Panel 3: Subject Added Success State inside modal immediately
          const formView = document.getElementById('addSkillModalFormView');
          const successView = document.getElementById('addSkillModalSuccessView');
          const successNameEl = document.getElementById('addSkillSuccessSubjectName');
          if (formView && successView) {
            if (successNameEl) successNameEl.textContent = name;
            formView.style.display = 'none';
            successView.style.display = 'block';
          } else {
            this.closeModal('addSkillModal');
            this.showToast(`Added "${name}" to your profile!`, 'plus');
          }

          // Reload subjects into assessment state
          await this.renderAssessmentCenter();
          this.renderAll();
          return true;
        } else {
          await window.store.addSkillWanted({ name, category, level, goal: desc });
          this.showToast(`Added "${name}" to your Learning Targets!`, 'bullseye');
          this.closeModal('addSkillModal');
          this.renderAll();
          return true;
        }
      } catch (err) {
        console.error('Error adding skill:', err);
        alert(err.message);
        return false;
      }
    },

    handleSuccessGoToAssessment() {
      this.closeModal('addSkillModal');

      // Reset modal views for next time
      const formView = document.getElementById('addSkillModalFormView');
      const successView = document.getElementById('addSkillModalSuccessView');
      if (formView) formView.style.display = 'block';
      if (successView) successView.style.display = 'none';

      // Switch to assessment tab
      this.switchView('view-quizzes');
      try {
        if (typeof history !== 'undefined' && history.pushState) {
          history.pushState({ view: 'quizzes' }, '', '/quizzes');
        }
      } catch (e) {}

      // Select newly added subject
      if (this.lastAddedSubjectName) {
        this.selectAssessmentSubject(this.lastAddedSubjectName);
      }

      // Smooth scroll to configuration
      setTimeout(() => {
        const configSec = document.getElementById('assessmentConfigSection');
        if (configSec) {
          configSec.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    },

    async loadAssessmentData() {
      return await this.renderAssessmentCenter();
    },

    handleSuccessAddAnother() {
      const formView = document.getElementById('addSkillModalFormView');
      const successView = document.getElementById('addSkillModalSuccessView');
      if (formView) formView.style.display = 'block';
      if (successView) successView.style.display = 'none';

      const nameInput = document.getElementById('skillNameInput');
      const descInput = document.getElementById('skillDescInput');
      const charCounter = document.getElementById('skillDescCharCounter');
      if (nameInput) {
        nameInput.value = '';
        nameInput.focus();
      }
      if (descInput) descInput.value = '';
      if (charCounter) charCounter.textContent = '0/500';
    },

    switchView(viewId) {
      this.currentTab = viewId;

      // Unfreeze page scrolling and clear any stale modal backdrops
      this.closeAllModals();
      document.body.classList.remove('portal-active');

      document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
      const activeSec = document.getElementById(viewId);
      if (activeSec) {
        activeSec.classList.add('active');
        activeSec.scrollTop = 0;
      }

      document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === viewId || (viewId === 'view-booking' && btn.dataset.target === 'view-sessions'));
      });

      if (viewId === 'view-matches') this.renderSmartMatches();
      if (viewId === 'view-explore') this.renderExploreCatalogue();
      if (viewId === 'view-quizzes') this.renderQuizzes();
      if (viewId === 'view-codelab' && window.codelab) window.codelab.render();
      if (viewId === 'view-booking') {
        if (!this.bookingState || !this.bookingState.step) {
          this.startBookingFlow();
        }
      }
      if (viewId === 'view-sessions') {
        this.sessionsFilter = 'UPCOMING';
        this.renderSessions();
        this.startSessionsLivePolling();
      } else {
        this.stopSessionsLivePolling();
      }
      if (viewId === 'view-room') this.renderLiveRoom();
      if (viewId === 'view-support') this.renderSupportDesk();
      if (viewId === 'view-wallet') this.renderWallet();
      if (viewId === 'view-chat') {
        this.renderChat();
      } else {
        this.stopChatLivePolling();
      }
      if (viewId === 'view-profile') this.renderProfile();
      if (viewId === 'view-upload-cert') {
        // Default to NPTEL platform card
        const nptelCard = document.getElementById('platformCardNptel');
        nptelCard?.click();
        this.loadCertificateStatusUI();
      }

      // Direct scrollbar to subpage view immediately
      if (typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
      const mainContent = document.querySelector('.main-content');
      if (mainContent) mainContent.scrollTop = 0;
    },

    async loadCertificateStatusUI() {
      const card = document.getElementById('certVerificationStatusCard');
      const badgeContainer = document.getElementById('certStatusBadgeContainer');
      const checklist = document.getElementById('certStageProgressChecklist');
      if (!badgeContainer) return;

      try {
        const current = window.store?.getCurrentPersona?.();
        const token = localStorage.getItem('token') || (window.store?.token || '');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (current?.id) headers['x-user-id'] = current.id;

        const res = await fetch(`http://localhost:3000/api/certificates/status?userId=${encodeURIComponent(current?.id || 'sri')}`, { headers });
        const data = await res.json();

        if (data.success) {
          const status = data.status || 'PENDING_VERIFICATION';
          const isVerified = status === 'VERIFIED';
          const isNotVerified = status === 'NOT_VERIFIED';
          const isManual = status === 'NEEDS_MANUAL_REVIEW';

          if (isVerified) {
            if (card) {
              card.style.background = '#f0fdf4';
              card.style.borderColor = '#bbf7d0';
            }
            badgeContainer.innerHTML = `
              <div style="background: #dcfce7; border: 1.5px solid #86efac; border-radius: var(--radius-md); padding: 0.6rem 0.85rem; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; font-weight: 800; color: #15803d; gap: 0.5rem;">
                <span style="display: flex; align-items: center; gap: 0.45rem;">
                  <i class="fa-solid fa-circle-check" style="color: #16a34a; font-size: 1.1rem;"></i>
                  🟢 VERIFIED CERTIFICATE
                </span>
                <span style="background: #16a34a; color: #fff; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.72rem;">Eligible Tutor ✓</span>
              </div>
              <div style="margin-top: 0.5rem; font-size: 0.78rem; color: #166534; line-height: 1.4;">
                <strong>Tutor Eligibility Authorized:</strong> You have passed certificate verification and are eligible to teach swap sessions and accept student bookings.
              </div>
            `;
          } else if (isNotVerified) {
            if (card) {
              card.style.background = '#fef2f2';
              card.style.borderColor = '#fecaca';
            }
            badgeContainer.innerHTML = `
              <div style="background: #fee2e2; border: 1.5px solid #fca5a5; border-radius: var(--radius-md); padding: 0.6rem 0.85rem; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; font-weight: 800; color: #b91c1c; gap: 0.5rem;">
                <span style="display: flex; align-items: center; gap: 0.45rem;">
                  <i class="fa-solid fa-circle-xmark" style="color: #dc2626; font-size: 1.1rem;"></i>
                  🔴 NOT VERIFIED
                </span>
                <span style="background: #dc2626; color: #fff; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.72rem;">Not Eligible</span>
              </div>
              <div style="margin-top: 0.5rem; font-size: 0.78rem; color: #991b1b; line-height: 1.4;">
                <strong>Tutor Eligibility Restricted:</strong> ${data.verification_reason || data.reason || 'Verification failed. Upload a valid, authentic NPTEL or recognized certificate.'}
              </div>
            `;
          } else if (isManual) {
            if (card) {
              card.style.background = '#fffbe6';
              card.style.borderColor = '#ffe58f';
            }
            badgeContainer.innerHTML = `
              <div style="background: #fff3c4; border: 1.5px solid #ffd666; border-radius: var(--radius-md); padding: 0.6rem 0.85rem; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; font-weight: 800; color: #d48806; gap: 0.5rem;">
                <span style="display: flex; align-items: center; gap: 0.45rem;">
                  <i class="fa-solid fa-user-clock" style="color: #fa8c16; font-size: 1.1rem;"></i>
                  🟠 NEEDS MANUAL REVIEW
                </span>
                <span style="background: #fa8c16; color: #fff; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.72rem;">Pending Faculty</span>
              </div>
              <div style="margin-top: 0.5rem; font-size: 0.78rem; color: #ad6800; line-height: 1.4;">
                <strong>Faculty Audit Queued:</strong> Automated API was unconfigured or inconclusive. Queued for Dr. S. K. Rao's review. Tutor access will be granted upon faculty approval.
              </div>
            `;
          } else {
            if (card) {
              card.style.background = '#f0f9ff';
              card.style.borderColor = '#bae6fd';
            }
            badgeContainer.innerHTML = `
              <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: var(--radius-md); padding: 0.5rem 0.75rem; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; font-weight: 700; color: #b45309;">
                <i class="fa-regular fa-clock"></i> Pending Verification Upload
              </div>
            `;
          }

          if (data.evidence && checklist) {
            checklist.style.display = 'block';
            const evidence = data.evidence;
            checklist.innerHTML = `
              <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.4rem;">Institutional Evidence Checklist:</div>
              <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                ${Object.entries(evidence).map(([key, val]) => `
                  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem;">
                    <span style="color: var(--text-secondary);">${key.replace(/_/g, ' ').toUpperCase()}:</span>
                    <strong style="color: ${String(val).startsWith('PASS') ? '#16a34a' : String(val).startsWith('FAIL') ? '#dc2626' : '#d97706'};">${val}</strong>
                  </div>
                `).join('')}
              </div>
            `;
          }
        }
      } catch (err) {
        console.error('Error loading certificate status UI:', err);
      }
    },

    openCertificateAuditModal(certId) {
      const user = window.store?.getCurrentPersona() || window.store?.currentUser || {};
      const certs = user.certificates || [];
      const cert = certs.find(c => c.id === certId || c.credential_id === certId || String(c.id).includes(certId)) || certs[0];
      if (!cert) {
        this.showToast('Certificate details not found.', 'circle-exclamation');
        return;
      }

      // Parse evidence if needed
      let evidence = {};
      if (typeof cert.verification_evidence === 'string') {
        try { evidence = JSON.parse(cert.verification_evidence); } catch (e) { evidence = {}; }
      } else if (typeof cert.verification_evidence === 'object' && cert.verification_evidence) {
        evidence = cert.verification_evidence;
      }

      const rawStatus = (cert.certificate_status || cert.verification_status || cert.status || '').toUpperCase();
      let status = 'PENDING_VERIFICATION';
      if (rawStatus === 'VERIFIED' || cert.is_verified === 1) {
        status = 'VERIFIED';
      } else if (rawStatus === 'NOT_VERIFIED' || cert.verification_result === 'FAKE' || cert.is_verified === -1) {
        status = 'NOT_VERIFIED';
      } else if (rawStatus === 'NEEDS_MANUAL_REVIEW' || rawStatus === 'NEEDS_REVIEW' || rawStatus === 'PENDING_FACULTY') {
        status = 'NEEDS_MANUAL_REVIEW';
      } else if (cert.is_verified === 0 && (cert.verification_reason || cert.rejection_reason)) {
        status = 'NOT_VERIFIED';
      }

      const isVerified = status === 'VERIFIED';
      const isNotVerified = status === 'NOT_VERIFIED';
      const isNeedsReview = status === 'NEEDS_MANUAL_REVIEW';

      const certTitle = cert.title || cert.skill_name || 'Academic Certificate';
      const certAuthority = cert.authority || cert.issuer || cert.platform || 'NPTEL';
      const credentialId = cert.credential_id || cert.certificate_id || cert.id || 'N/A';
      const certScore = cert.score_or_grade || cert.score || 'N/A';
      const uploadDate = cert.uploaded_at ? new Date(cert.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : (cert.created_at ? new Date(cert.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '22 Sep 2026');

      // Populate Top Strip
      const titleEl = document.getElementById('certAuditTitle');
      if (titleEl) titleEl.textContent = certTitle;
      const authEl = document.getElementById('certAuditAuthority');
      if (authEl) authEl.textContent = certAuthority;
      const idEl = document.getElementById('certAuditCredentialId');
      if (idEl) idEl.textContent = credentialId;
      const scoreEl = document.getElementById('certAuditScore');
      if (scoreEl) scoreEl.textContent = certScore;
      const dateEl = document.getElementById('certAuditDate');
      if (dateEl) dateEl.textContent = uploadDate;

      // Update Flowchart Stepper
      const flowStep3 = document.getElementById('flowStep3Verification');
      const flowStep3Icon = document.getElementById('flowStep3Icon');
      const flowStep4 = document.getElementById('flowStep4Decision');
      const flowStep4Icon = document.getElementById('flowStep4Icon');
      const flowStep5 = document.getElementById('flowStep5Access');
      const flowStep5Icon = document.getElementById('flowStep5Icon');

      if (flowStep3 && flowStep3Icon) {
        flowStep3.style.color = '#16a34a';
        flowStep3Icon.className = 'fa-solid fa-circle-check';
      }
      if (flowStep4 && flowStep4Icon) {
        flowStep4.style.color = isVerified ? '#16a34a' : (isNotVerified ? '#dc2626' : '#ea580c');
        flowStep4Icon.className = isVerified ? 'fa-solid fa-circle-check' : (isNotVerified ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-triangle-exclamation');
      }
      if (flowStep5 && flowStep5Icon) {
        flowStep5.style.color = isVerified ? '#16a34a' : '#94a3b8';
        flowStep5Icon.className = isVerified ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-dot';
      }

      // Decision Engine Card
      const cardEl = document.getElementById('certAuditDecisionCard');
      const badgeEl = document.getElementById('certAuditDecisionBadge');
      const eligEl = document.getElementById('certAuditEligibilityBadge');
      const msgEl = document.getElementById('certAuditDecisionMessage');
      const reasonText = cert.verification_reason || cert.rejection_reason || '';

      if (isVerified) {
        if (cardEl) {
          cardEl.style.background = '#f0fdf4';
          cardEl.style.border = '1.5px solid #86efac';
          cardEl.style.color = '#14532d';
        }
        if (badgeEl) {
          badgeEl.style.background = '#dcfce7';
          badgeEl.style.color = '#15803d';
          badgeEl.style.border = '1px solid #86efac';
          badgeEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> VERIFIED';
        }
        if (eligEl) {
          eligEl.style.background = '#16a34a';
          eligEl.style.color = '#fff';
          eligEl.textContent = 'Eligible to teach ✓';
        }
        if (msgEl) {
          msgEl.innerHTML = `<span style="color:#15803d;"><i class="fa-solid fa-check"></i> Official issuer registry check passed.</span> Multi-vector analysis confirmed authentic institutional watermark, valid credential schema, and verified identity cross-match. You are authorized as an eligible tutor for Book Swap mentor sessions and earn +2.0 Skill Credits!`;
        }
      } else if (isNotVerified) {
        if (cardEl) {
          cardEl.style.background = '#fef2f2';
          cardEl.style.border = '1.5px solid #fca5a5';
          cardEl.style.color = '#7f1d1d';
        }
        if (badgeEl) {
          badgeEl.style.background = '#fee2e2';
          badgeEl.style.color = '#b91c1c';
          badgeEl.style.border = '1px solid #fca5a5';
          badgeEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> NOT VERIFIED';
        }
        if (eligEl) {
          eligEl.style.background = '#dc2626';
          eligEl.style.color = '#fff';
          eligEl.textContent = 'Not eligible to teach ✗';
        }
        if (msgEl) {
          msgEl.innerHTML = `<span style="color:#b91c1c;"><i class="fa-solid fa-triangle-exclamation"></i> Decision Engine: Verification Failed.</span> ${this.escapeHtml(reasonText || 'Credential ID does not conform to official issuer registry format, or document forensics detected placeholder/mock patterns.')}`;
        }
      } else if (isNeedsReview) {
        if (cardEl) {
          cardEl.style.background = '#fff7ed';
          cardEl.style.border = '1.5px solid #fdba74';
          cardEl.style.color = '#7c2d12';
        }
        if (badgeEl) {
          badgeEl.style.background = '#ffedd5';
          badgeEl.style.color = '#c2410c';
          badgeEl.style.border = '1px solid #fdba74';
          badgeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> NEEDS REVIEW';
        }
        if (eligEl) {
          eligEl.style.background = '#ea580c';
          eligEl.style.color = '#fff';
          eligEl.textContent = 'Not eligible yet (Queued)';
        }
        if (msgEl) {
          msgEl.innerHTML = `<span style="color:#c2410c;"><i class="fa-solid fa-clock"></i> Decision Engine: Queued for Faculty Review.</span> Automated issuer checks could not reach conclusive registry status. Forwarded for Dr. S. K. Rao / Faculty Administrator manual audit. Tutor eligibility pending approval.`;
        }
      } else {
        if (cardEl) {
          cardEl.style.background = '#fefce8';
          cardEl.style.border = '1.5px solid #fde68a';
          cardEl.style.color = '#713f12';
        }
        if (badgeEl) {
          badgeEl.style.background = '#fef3c7';
          badgeEl.style.color = '#a16207';
          badgeEl.style.border = '1px solid #fde68a';
          badgeEl.innerHTML = '<i class="fa-regular fa-clock"></i> PENDING VERIFICATION';
        }
        if (eligEl) {
          eligEl.style.background = '#d97706';
          eligEl.style.color = '#fff';
          eligEl.textContent = 'Verification in progress...';
        }
        if (msgEl) {
          msgEl.textContent = 'Verification starts immediately. Running multi-vector OCR, domain, schema, forensics, and issuer checks...';
        }
      }

      // Update 6 Pipeline Stages Details
      const updateStage = (badgeId, detailsId, isPass, passText, failText, passDetails, failDetails) => {
        const b = document.getElementById(badgeId);
        const d = document.getElementById(detailsId);
        if (b) {
          b.style.background = isPass ? '#dcfce7' : '#fee2e2';
          b.style.color = isPass ? '#15803d' : '#b91c1c';
          b.style.border = isPass ? '1px solid #86efac' : '1px solid #fca5a5';
          b.innerHTML = isPass ? `<i class="fa-solid fa-check"></i> ${passText}` : `<i class="fa-solid fa-xmark"></i> ${failText}`;
        }
        if (d) {
          d.textContent = isPass ? passDetails : failDetails;
        }
      };

      // Stage 1: OCR
      const ocrPass = evidence.fileValid !== false && evidence.certificateDetected !== false;
      updateStage('stageOcrBadge', 'stageOcrDetails', ocrPass, 'PASS', 'FAIL',
        `Payload text extracted. Detected course keywords and student identity tokens for "${certTitle}".`,
        'OCR failed to detect authentic academic certificate structure or text tokens.');

      // Stage 2: QR / Verification URL
      const qrPass = isVerified || (evidence.domainAuthentic === true);
      updateStage('stageQrBadge', 'stageQrDetails', qrPass, 'PASS', 'FAIL',
        `Verification URL points to official authorized domain (${evidence.matchedIssuerConfig?.domain || 'nptel.ac.in'}).`,
        `Verification URL does not route to an accredited institutional domain.`);

      // Stage 3: Certificate ID Extraction
      const idPass = isVerified || (evidence.idPatternValid === true);
      updateStage('stageIdBadge', 'stageIdDetails', idPass, 'PASS', 'FAIL',
        `Credential ID "${credentialId}" conforms to official registry regex syntax.`,
        `Credential ID "${credentialId}" failed official schema regex syntax.`);

      // Stage 4: Name/Course Matching
      const namePass = !evidence.nameMismatch;
      updateStage('stageNameBadge', 'stageNameDetails', namePass, 'PASS', 'MISMATCH',
        `Candidate name matched registered student profile account identity ("${user.name || 'Student'}").`,
        `Name mismatch: Document recipient does not match account name "${user.name || 'Student'}".`);

      // Stage 5: Document Analysis
      const docPass = !evidence.tamperingDetected && isVerified;
      updateStage('stageDocBadge', 'stageDocDetails', docPass, 'PASS', 'ANOMALIES',
        'Document forensics passed: No font alteration, tampering, or duplicate SHA-256 hash detected.',
        `Forensics alert: ${(evidence.suspiciousElements || ['Mock or placeholder signatures detected'])[0]}`);

      // Stage 6: Official Issuer Check
      const issuerBadge = document.getElementById('stageIssuerBadge');
      const issuerDetails = document.getElementById('stageIssuerDetails');
      if (issuerBadge && issuerDetails) {
        if (isVerified) {
          issuerBadge.style.background = '#dcfce7';
          issuerBadge.style.color = '#15803d';
          issuerBadge.style.border = '1px solid #86efac';
          issuerBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> VERIFIED';
          issuerDetails.textContent = `Official institutional registry verification passed via ${certAuthority}.`;
        } else if (isNeedsReview) {
          issuerBadge.style.background = '#ffedd5';
          issuerBadge.style.color = '#c2410c';
          issuerBadge.style.border = '1px solid #fdba74';
          issuerBadge.innerHTML = '<i class="fa-solid fa-clock"></i> PENDING AUDIT';
          issuerDetails.textContent = 'Automated issuer registry API unconfigured; queued for faculty manual audit.';
        } else {
          issuerBadge.style.background = '#fee2e2';
          issuerBadge.style.color = '#b91c1c';
          issuerBadge.style.border = '1px solid #fca5a5';
          issuerBadge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> NOT VERIFIED';
          issuerDetails.textContent = `Official registry verification failed: Credential ID "${credentialId}" not found in ${certAuthority} database.`;
        }
      }

      // Tutor Tier Impact & Book Swap Access Connection
      const skills = user.skillsOffered || [];
      const matchingSkill = skills.find(s => 
        s.name.toLowerCase().includes(certTitle.toLowerCase()) || 
        certTitle.toLowerCase().includes(s.name.toLowerCase()) ||
        s.name.toLowerCase().includes(cert.skill_name?.toLowerCase() || '')
      ) || skills[0] || {};
      const quizScore = Number(matchingSkill.quiz_score) || 0;

      const tierRuleEl = document.getElementById('certAuditTierRule');
      const tierRuleSubEl = document.getElementById('certAuditTierRuleSub');
      const tierResultEl = document.getElementById('certAuditTierResult');
      const tierRateEl = document.getElementById('certAuditTierRate');
      const bookSwapEl = document.getElementById('certAuditBookSwapAccess');
      const bonusCreditsEl = document.getElementById('certAuditCreditsBonus');

      if (tierRuleEl && tierResultEl) {
        if (isVerified) {
          if (quizScore >= 90) {
            tierRuleEl.textContent = `Quiz ${quizScore}% (≥90%) + Verified Cert`;
            tierRuleSubEl.textContent = 'Top Distinction Requirement Satisfied';
            tierResultEl.textContent = '🥇 Elite Master Tutor';
            tierResultEl.style.color = '#b45309';
            if (tierRateEl) tierRateEl.textContent = '2.5 Credits / hr';
          } else if (quizScore >= 70) {
            tierRuleEl.textContent = `Quiz ${quizScore}% (≥70%) + Verified Cert`;
            tierRuleSubEl.textContent = 'Passing Requirement Satisfied';
            tierResultEl.textContent = '🎖️ Advanced Tutor';
            tierResultEl.style.color = '#0284c7';
            if (tierRateEl) tierRateEl.textContent = '2.0 Credits / hr';
          } else {
            tierRuleEl.textContent = 'Verified Cert (Quiz Pending)';
            tierRuleSubEl.textContent = 'Pass Quiz (≥70%) to unlock rate';
            tierResultEl.textContent = 'Verified Scholar (Tutor Pending Quiz)';
            tierResultEl.style.color = '#15803d';
            if (tierRateEl) tierRateEl.textContent = '0.0 Cr/hr (Take Quiz to Unlock)';
          }

          if (bookSwapEl) {
            bookSwapEl.textContent = '🟢 Unlocked & Eligible';
            bookSwapEl.style.color = '#15803d';
          }
          if (bonusCreditsEl) {
            bonusCreditsEl.textContent = '+2.0 Skill Credits Awarded ✓';
            bonusCreditsEl.style.color = '#15803d';
          }
        } else if (isNotVerified) {
          tierRuleEl.textContent = 'Certificate NOT VERIFIED';
          tierRuleSubEl.textContent = 'Security / Syntax check failed';
          tierResultEl.textContent = quizScore >= 90 ? '🥈 Silver Tutor (Quiz Only)' : (quizScore >= 70 ? '🥉 Bronze Tutor (Quiz Only)' : 'Student Learner (Unverified)');
          tierResultEl.style.color = '#dc2626';
          if (tierRateEl) tierRateEl.textContent = quizScore >= 90 ? '1.5 Cr/hr (No Cert)' : (quizScore >= 70 ? '1.0 Cr/hr (No Cert)' : '0.0 Cr/hr (Unqualified)');

          if (bookSwapEl) {
            bookSwapEl.textContent = '🔴 Locked (Not Eligible)';
            bookSwapEl.style.color = '#dc2626';
          }
          if (bonusCreditsEl) {
            bonusCreditsEl.textContent = '0.0 Credits (Certificate Rejected)';
            bonusCreditsEl.style.color = '#dc2626';
          }
        } else {
          tierRuleEl.textContent = 'Certificate Pending Faculty Review';
          tierRuleSubEl.textContent = 'Awaiting Manual Audit';
          tierResultEl.textContent = 'Pending Faculty Audit';
          tierResultEl.style.color = '#ea580c';
          if (tierRateEl) tierRateEl.textContent = 'Rate Locked Until Approval';

          if (bookSwapEl) {
            bookSwapEl.textContent = '🟠 Pending Review';
            bookSwapEl.style.color = '#ea580c';
          }
          if (bonusCreditsEl) {
            bonusCreditsEl.textContent = 'Credits Pending Approval';
            bonusCreditsEl.style.color = '#ea580c';
          }
        }
      }

      this.openModal('certificateAuditModal');
    },

    // ==========================================
    // Render Functions
    // ==========================================
    async renderAll() {
      try { this.renderNavbar(); } catch (e) { console.error('Error rendering navbar:', e); }
      try { this.renderNotifications(); } catch (e) { console.error('Error rendering notifications:', e); }
      try { await this.updateSidebarBadges(); } catch (e) { console.error('Error updating sidebar badges:', e); }
      try { await this.renderSmartMatches(); } catch (e) { console.error('Error rendering matches:', e); }
      try { await this.renderExploreCatalogue(); } catch (e) { console.error('Error rendering explore:', e); }
      try { await this.renderQuizzes(); } catch (e) { console.error('Error rendering quizzes:', e); }
      try { if (window.codelab) window.codelab.render(); } catch (e) { console.error('Error rendering codelab:', e); }
      try { await this.renderSessions(); } catch (e) { console.error('Error rendering sessions:', e); }
      try { await this.renderSupportDesk(); } catch (e) { console.error('Error rendering support desk:', e); }
      try { await this.renderWallet(); } catch (e) { console.error('Error rendering wallet:', e); }
      try { await this.renderChat(); } catch (e) { console.error('Error rendering chat:', e); }
      try { await this.renderProfile(); } catch (e) { console.error('Error rendering profile:', e); }
      if (this.currentTab === 'view-room') {
        try { await this.renderLiveRoom(); } catch (e) { console.error('Error rendering live room:', e); }
      }
    },

    renderNavbar() {
      const user = window.store.getCurrentPersona();
      const role = window.store.getUserRole();

      const creditEl = document.getElementById('navCreditCount');
      if (creditEl) creditEl.textContent = (user?.credits || 0).toFixed(1);
      const nameEl = document.getElementById('navUserName');
      if (nameEl) nameEl.textContent = user?.name || 'User';
      const roleEl = document.getElementById('navUserRole');
      if (roleEl) roleEl.textContent = window.store.isFacultyAdmin() ? 'Faculty Coordinator' : (user?.badges?.find(b => b.includes('Tutor')) || user?.major || 'Student');

      const roleBadge = document.getElementById('navAuthRoleBadge');
      if (roleBadge) {
        roleBadge.textContent = role;
        roleBadge.className = `auth-role-pill role-${role.toLowerCase()}`;
      }

      const navAvatar = document.getElementById('navUserAvatar');
      if (navAvatar) {
        navAvatar.src = window.getStudentAvatar(user?.id);
        navAvatar.alt = user?.name || 'User';
      }

      // Single User Dashboard Profile Dropdown Elements
      const dropdownAvatar = document.getElementById('navDropdownAvatar');
      if (dropdownAvatar) dropdownAvatar.src = window.getStudentAvatar(user?.id);
      const dropdownName = document.getElementById('navDropdownName');
      if (dropdownName) dropdownName.textContent = user?.name || 'User';
      const dropdownEmail = document.getElementById('navDropdownEmail');
      if (dropdownEmail) dropdownEmail.textContent = user?.email || (user?.id + '@vignan.ac.in');
      const dropdownMajor = document.getElementById('navDropdownMajor');
      if (dropdownMajor) dropdownMajor.textContent = user?.major || 'Vignan University';
      const dropdownRole = document.getElementById('navDropdownRoleBadge');
      if (dropdownRole) {
        dropdownRole.textContent = role;
        dropdownRole.className = `auth-role-pill role-${role.toLowerCase()}`;
      }
      const dropdownCredits = document.getElementById('navDropdownCredits');
      if (dropdownCredits) {
        dropdownCredits.textContent = `${Number(user?.credits || 0).toFixed(1)} Credits`;
      }

      // Single User Auth Login Card Elements
      const authAvatar = document.getElementById('authCardUserAvatar');
      if (authAvatar) authAvatar.src = window.getStudentAvatar(user?.id);
      const authName = document.getElementById('authCardUserName');
      if (authName) authName.textContent = user?.name || 'User';
      const authEmail = document.getElementById('authCardUserEmail');
      if (authEmail) authEmail.textContent = `${user?.email || (user?.id + '@vignan.ac.in')} • ${user?.college || 'Vignan University'}`;
      const authRole = document.getElementById('authCardRoleBadge');
      if (authRole) {
        authRole.textContent = role;
        authRole.className = `auth-role-pill role-${role.toLowerCase()}`;
      }

      const isFaculty = window.store.isFacultyAdmin();
      document.querySelectorAll('.admin-only-section').forEach(el => {
        if (el && el.style) el.style.display = isFaculty ? 'flex' : 'none';
      });

      const instAvatar = document.getElementById('liveRoomInstructorAvatar');
      const learnAvatar = document.getElementById('liveRoomLearnerAvatar');
      if (instAvatar) instAvatar.src = window.getStudentAvatar('rishitha');
      if (learnAvatar) learnAvatar.src = window.getStudentAvatar('sri');
    },

    async renderNotifications() {
      if (window.store.fetchNotifications) {
        try { await window.store.fetchNotifications(); } catch (e) {}
      }
      const notifs = window.store.notifications || [];
      const unreadCount = notifs.filter(n => n.unread || n.is_unread).length;
      const badge = document.getElementById('notifBadge');
      if (badge) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
      }

      const list = document.getElementById('notifListContainer');
      if (!list) return;

      list.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.unread || n.is_unread ? 'unread' : ''}">
          <div style="font-size: 1.1rem; color: var(--primary);">
            <i class="fa-solid fa-${n.type === 'credit' ? 'coins' : n.type === 'calendar' ? 'calendar-check' : n.type === 'quiz' ? 'award' : 'wand-magic-sparkles'}"></i>
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 700;">${n.title}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${n.time}</div>
          </div>
        </div>
      `).join('');
    },

    // ==========================================
    // Centralized Dynamic Sidebar Notification Badges
    // ==========================================
    async updateSidebarBadges(providedCounts = null) {
      const activeUser = window.store.getCurrentPersona();
      const token = window.store.token || localStorage.getItem('skillswap_auth_token') || localStorage.getItem('token');

      const badgeSession = document.getElementById('sidebarSessionBadge');
      const badgeBookSwap = document.getElementById('sidebarBookSwapBadge');
      const badgeChat = document.getElementById('sidebarChatBadge');
      const badgeSupport = document.getElementById('sidebarSupportBadge');
      const badgeCert = document.getElementById('sidebarCertBadge');
      const badgeQuiz = document.getElementById('sidebarQuizBadge');
      const badgeLive = document.getElementById('sidebarLiveRoomBadge');

      if (!activeUser || !token) {
        if (badgeSession) badgeSession.style.display = 'none';
        if (badgeBookSwap) badgeBookSwap.style.display = 'none';
        if (badgeChat) badgeChat.style.display = 'none';
        if (badgeSupport) badgeSupport.style.display = 'none';
        if (badgeCert) badgeCert.style.display = 'none';
        if (badgeLive) badgeLive.style.display = 'none';
        if (badgeQuiz) {
          badgeQuiz.textContent = 'Quiz';
          badgeQuiz.style.display = 'inline-flex';
        }
        return;
      }

      let counts = providedCounts;
      if (!counts) {
        try {
          counts = await window.store.fetchSidebarCounts();
        } catch (e) {
          counts = {};
        }
      }

      // 1. My Sessions Badge: Actionable session count (pending requests)
      if (badgeSession) {
        const count = Number(counts.mySessions || 0);
        if (count > 0) {
          badgeSession.textContent = count > 99 ? '99+' : count;
          badgeSession.style.display = 'inline-flex';
        } else {
          badgeSession.style.display = 'none';
        }
      }

      // 2. Book Swap Badge: Pending swap requests
      if (badgeBookSwap) {
        const count = Number(counts.bookSwap || 0);
        if (count > 0) {
          badgeBookSwap.textContent = count > 99 ? '99+' : count;
          badgeBookSwap.style.display = 'inline-flex';
        } else {
          badgeBookSwap.style.display = 'none';
        }
      }

      // 3. Peer Messages Badge: Unread messages
      if (badgeChat) {
        const count = Number(counts.messages || 0);
        if (count > 0) {
          badgeChat.textContent = count > 99 ? '99+' : count;
          badgeChat.style.display = 'inline-flex';
        } else {
          badgeChat.style.display = 'none';
        }
      }

      // 4. Support Desk Badge: Open doubts / tickets (Format: "X Open")
      if (badgeSupport) {
        const count = Number(counts.support || 0);
        if (count > 0) {
          badgeSupport.textContent = `${count > 99 ? '99+' : count} Open`;
          badgeSupport.style.display = 'inline-flex';
        } else {
          badgeSupport.style.display = 'none';
        }
      }

      // 5. Certificates & Portfolio Badge: Actionable certs (NOT_VERIFIED or NEEDS_MANUAL_REVIEW)
      if (badgeCert) {
        const count = Number(counts.certificates || 0);
        if (count > 0) {
          badgeCert.textContent = count > 99 ? '99+' : count;
          badgeCert.style.display = 'inline-flex';
        } else {
          badgeCert.style.display = 'none';
        }
      }

      // 6. Skill Assessments Badge: Actionable notifications or preserve feature pill "Quiz"
      if (badgeQuiz) {
        const count = Number(counts.assessments || 0);
        if (count > 0) {
          badgeQuiz.textContent = count > 99 ? '99+' : count;
          badgeQuiz.style.display = 'inline-flex';
          badgeQuiz.style.background = 'rgba(245, 158, 11, 0.2)';
          badgeQuiz.style.color = '#f59e0b';
        } else {
          badgeQuiz.textContent = 'Quiz';
          badgeQuiz.style.display = 'inline-flex';
          badgeQuiz.style.background = 'var(--accent-amber-light)';
          badgeQuiz.style.color = 'var(--accent-amber)';
        }
      }

      // 7. Live Session Room Badge: Active session in progress
      if (badgeLive) {
        const count = Number(counts.liveRoom || 0);
        if (count > 0) {
          badgeLive.textContent = 'LIVE';
          badgeLive.style.display = 'inline-flex';
        } else {
          badgeLive.style.display = 'none';
        }
      }
    },

    startSidebarBadgesPolling() {
      if (this.sidebarBadgesInterval) clearInterval(this.sidebarBadgesInterval);
      this.sidebarBadgesInterval = setInterval(async () => {
        const token = window.store.token || localStorage.getItem('skillswap_auth_token') || localStorage.getItem('token');
        if (token) {
          try {
            await this.updateSidebarBadges();
          } catch (e) {}
        }
      }, 4000);
    },

    async renderSmartMatches(filter = 'all') {
      const grid = document.getElementById('matchesCardGrid');
      if (!grid) return;

      const matches = await window.store.getMatchesForCurrentPersona();
      let filtered = [...matches];

      if (filter === 'twoway') {
        filtered = matches.filter(m => m.isTwoWay);
      } else if (filter === 'elite') {
        filtered = matches.filter(m => (m.peer.skillsOffered || []).some(s => s.tier === 'Elite Master'));
      } else if (filter === 'advanced') {
        filtered = matches.filter(m => (m.peer.skillsOffered || []).some(s => s.tier === 'Advanced'));
      } else if (filter === 'design') {
        filtered = matches.filter(m => (m.peer.skillsOffered || []).some(s => (s.category || '').toLowerCase().includes('design') || (s.category || '').toLowerCase().includes('ui')));
      } else if (filter === 'tech') {
        filtered = matches.filter(m => (m.peer.skillsOffered || []).some(s => (s.category || '').toLowerCase().includes('tech') || (s.category || '').toLowerCase().includes('cloud') || (s.category || '').toLowerCase().includes('data')));
      }

      // Sort matching peers
      const sortMode = document.getElementById('matchesSortSelect')?.value || (filter === 'credits_asc' ? 'credits_asc' : filter === 'credits_desc' ? 'credits_desc' : 'compatibility');
      const getRate = (p) => (p.skillsOffered && p.skillsOffered.length > 0) ? (Number(p.skillsOffered[0].rate) || 1.0) : 1.0;

      if (sortMode === 'credits_asc' || filter === 'credits_asc') {
        filtered.sort((a, b) => getRate(a.peer) - getRate(b.peer));
      } else if (sortMode === 'credits_desc' || filter === 'credits_desc') {
        filtered.sort((a, b) => getRate(b.peer) - getRate(a.peer));
      } else if (sortMode === 'rating') {
        filtered.sort((a, b) => (Number(b.peer.rating) || 5.0) - (Number(a.peer.rating) || 5.0));
      } else {
        filtered.sort((a, b) => b.matchScore - a.matchScore);
      }

      if (filtered.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-xl);">
            <i class="fa-solid fa-face-smile" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
            <h3>No specific matches under this filter</h3>
            <p style="color: var(--text-secondary); margin-top: 0.5rem;">Try selecting 'All Matches' or explore our full peer catalogue.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = filtered.map(m => {
        const peer = m.peer;
        const topSkill = (peer.skillsOffered && peer.skillsOffered.length > 0) ? peer.skillsOffered[0] : { name: 'Peer Mentoring', rate: 1.0, tier: 'Bronze' };
        const hourlyRate = topSkill.rate || 1.0;
        const tier = topSkill.tier || 'Bronze';

        let tierBadgeHtml = '<span class="student-badge">🥉 1. Bronze Tutor</span>';
        if (tier === 'Elite Master') {
          tierBadgeHtml = '<span class="student-badge" style="background: rgba(245, 158, 11, 0.15); color: #b45309; border-color: rgba(245, 158, 11, 0.4);"><i class="fa-solid fa-medal"></i> 🥇 4. Elite Master</span>';
        } else if (tier === 'Advanced') {
          tierBadgeHtml = '<span class="student-badge" style="background: rgba(14, 165, 233, 0.15); color: #0284c7; border-color: rgba(14, 165, 233, 0.4);"><i class="fa-solid fa-certificate"></i> 🎖️ 3. Advanced</span>';
        } else if (tier === 'Silver') {
          tierBadgeHtml = '<span class="student-badge" style="background: rgba(148, 163, 184, 0.15); color: #475569;"><i class="fa-solid fa-star"></i> 🥈 2. Silver (Quiz &ge; 90%)</span>';
        }

        const teachSkills = (peer.skillsOffered || []).map(s => `
          <span class="tag-badge ${m.canTeachMe.some(ct => ct.name === s.name) ? 'highlight' : ''}">
            ${s.is_verified ? '<i class="fa-solid fa-shield-check" style="color:var(--accent-emerald);"></i> ' : ''}${s.name} (${s.rate || 1.0} Cr/hr)
          </span>
        `).join('');

        const wantSkills = (peer.skillsWanted || []).map(s => `
          <span class="tag-badge ${m.canLearnFromMe.some(cl => cl.name === s.name) ? 'highlight' : ''}">
            ${s.name}
          </span>
        `).join('');

        return `
          <div class="match-card ${m.isTwoWay ? 'featured-2way' : ''}">
            ${m.isTwoWay ? `
              <div class="featured-banner-tag">
                <i class="fa-solid fa-bolt"></i> 2-WAY RECIPROCAL MATCH (${m.matchScore}% COMPATIBLE)
              </div>
            ` : ''}

            <div class="card-user-header">
              ${window.getUserLogoCardHtml(peer, 52)}
              <div class="card-user-info">
                <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                  <h3>${peer.name || peer.id}</h3>
                  ${tierBadgeHtml}
                </div>
                <div class="card-user-meta">${peer.major || 'Vignan Student'} • ${peer.college || 'Vignan University'}</div>
              </div>
              <div class="match-score-badge">
                <i class="fa-solid fa-sparkles"></i> ${m.matchScore}% Match
              </div>
            </div>

            <p class="card-bio">${peer.bio || 'Vignan University peer learning enthusiast.'}</p>

            <div class="swap-skills-box">
              <div class="skill-row">
                <span class="skill-row-label">Can Teach You:</span>
                <div class="skill-tags">
                  ${teachSkills || '<span style="color:var(--text-muted); font-size:0.8rem;">Open to custom requests</span>'}
                </div>
              </div>
              <div class="skill-row">
                <span class="skill-row-label">Wants to Learn:</span>
                <div class="skill-tags">
                  ${wantSkills || '<span style="color:var(--text-muted); font-size:0.8rem;">Flexible on topics</span>'}
                </div>
              </div>
            </div>

            <div class="card-stats-bar">
              <div class="card-rating">
                <i class="fa-solid fa-star"></i> ${peer.rating || '5.0'} (${peer.reviewsCount || peer.reviews_count || 0} reviews)
              </div>
              <div style="font-weight: 700; color: var(--primary);">
                Rate: ${hourlyRate} Cr/hr
              </div>
            </div>

            <div class="card-actions">
              <button class="btn btn-secondary btn-sm" onclick="window.app.startDirectChat('${peer.id}')">
                <i class="fa-regular fa-comment"></i> Chat
              </button>
              <button class="btn btn-primary btn-sm" onclick="window.app.openBookingModal('${peer.id}', '${topSkill.name}', ${hourlyRate}, '${tier}')">
                <i class="fa-solid fa-arrow-right-arrow-left"></i> Book Swap
              </button>
            </div>
          </div>
        `;
      }).join('');
    },

    escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    },

    escapeQuotes(str) {
      if (!str) return '';
      return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    },

    // ==========================================
    // Universal Top Search Engine Methods
    // ==========================================
    performGlobalSearch(rawQuery) {
      const dropdown = document.getElementById('globalSearchResultsDropdown');
      const clearBtn = document.getElementById('globalSearchClearBtn');
      if (!dropdown) return;

      const q = (rawQuery || '').trim().toLowerCase();
      if (clearBtn) {
        clearBtn.style.display = q.length > 0 ? 'flex' : 'none';
      }

      if (!q) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
      }

      const current = window.store?.getCurrentPersona();
      const allPeers = Object.values(window.store?.personas || {}).filter(p => !p.isAdmin && !p.is_admin);

      const matches = [];
      allPeers.forEach(peer => {
        let score = 0;
        let primaryMatchedSkill = null;
        const matchedSkills = [];

        // 1. Inspect skillsOffered (Priority 1)
        (peer.skillsOffered || []).forEach(s => {
          const sName = (s.name || '').toLowerCase();
          const sDesc = (s.desc || s.description || '').toLowerCase();
          const sCat = (s.category || '').toLowerCase();
          const sTier = (s.tier || '').toLowerCase();

          if (sName === q) {
            score += 150;
            matchedSkills.push(s);
            if (!primaryMatchedSkill) primaryMatchedSkill = s;
          } else if (sName.includes(q)) {
            score += 100;
            matchedSkills.push(s);
            if (!primaryMatchedSkill) primaryMatchedSkill = s;
          } else if (sDesc.includes(q) || sCat.includes(q) || sTier.includes(q)) {
            score += 40;
            matchedSkills.push(s);
            if (!primaryMatchedSkill) primaryMatchedSkill = s;
          }
        });

        // 2. Inspect peer name
        if ((peer.name || '').toLowerCase().includes(q)) {
          score += 60;
        }

        // 3. Inspect verified certificates
        (peer.certificates || []).forEach(c => {
          const cSkill = (c.skill_name || '').toLowerCase();
          const cTitle = (c.title || '').toLowerCase();
          const cAuth = (c.authority || '').toLowerCase();
          if (cSkill.includes(q) || cTitle.includes(q) || cAuth.includes(q)) {
            score += 50;
            if (!primaryMatchedSkill) {
              primaryMatchedSkill = (peer.skillsOffered || []).find(s => s.name.toLowerCase().includes(q)) || peer.skillsOffered?.[0];
            }
          }
        });

        // 4. Inspect Major, College, Bio
        if ((peer.major || '').toLowerCase().includes(q) || (peer.college || '').toLowerCase().includes(q)) {
          score += 25;
        }
        if ((peer.bio || '').toLowerCase().includes(q)) {
          score += 15;
        }

        if (score > 0) {
          const topSkill = primaryMatchedSkill || peer.skillsOffered?.[0] || { name: 'Peer Mentoring', rate: 1.0, tier: 'Bronze' };
          matches.push({
            peer,
            score,
            topSkill,
            matchedSkills
          });
        }
      });

      // Sort by relevance score desc, then by rating / reviews
      matches.sort((a, b) => b.score - a.score || (Number(b.peer.rating) || 5.0) - (Number(a.peer.rating) || 5.0));

      dropdown.style.display = 'block';

      if (matches.length === 0) {
        dropdown.innerHTML = `
          <div class="nav-search-empty">
            <i class="fa-solid fa-magnifying-glass" style="font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--text-muted); display: block;"></i>
            No tutors found matching "<strong>${this.escapeHtml(rawQuery)}</strong>"<br>
            <span style="font-size: 0.74rem; color: var(--text-muted); margin-top: 0.35rem; display: inline-block;">Try searching <strong>Python</strong>, <strong>UI/UX</strong>, <strong>React</strong>, <strong>DSA</strong>, <strong>SQL</strong>, or <strong>Cyber Security</strong>.</span>
          </div>
        `;
        return;
      }

      const topResults = matches.slice(0, 6);
      dropdown.innerHTML = `
        <div class="nav-search-header">
          <span><i class="fa-solid fa-graduation-cap" style="color: var(--primary);"></i> Matching Tutors (${matches.length})</span>
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: normal;">Press Enter to see all</span>
        </div>
        <div class="nav-search-results-list">
          ${topResults.map(m => {
        const p = m.peer;
        const s = m.topSkill;
        const isSelf = p.id === current?.id;
        const tier = s.tier || 'Bronze';
        let tierIcon = '🥉';
        if (tier === 'Elite Master') tierIcon = '🥇';
        else if (tier === 'Advanced') tierIcon = '🎖️';
        else if (tier === 'Silver') tierIcon = '🥈';

        return `
              <div class="nav-search-item" onclick="window.app.handleGlobalSearchSelect('${p.id}', '${this.escapeQuotes(s.name)}', ${s.rate || 2.5}, '${this.escapeQuotes(tier)}')">
                <div class="nav-search-item-left">
                  ${window.getUserLogoCardHtml ? window.getUserLogoCardHtml(p, 40) : `<img src="${window.getStudentAvatar(p.id)}" style="width:40px;height:40px;border-radius:50%;">`}
                  <div class="nav-search-item-info">
                    <div class="nav-search-item-name">
                      <span>${this.escapeHtml(p.name)}</span>
                      ${isSelf ? '<span style="font-size:0.68rem; color:var(--primary); font-weight:600;">(You)</span>' : ''}
                      <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); margin-left: auto;">${tierIcon} ${tier}</span>
                    </div>
                    <div class="nav-search-item-skill">
                      <span class="skill-badge-highlight"><i class="fa-solid fa-code"></i> ${this.escapeHtml(s.name)}</span>
                      <span style="font-size: 0.72rem; color: var(--text-muted);">• ${this.escapeHtml(p.major || 'Vignan University')}</span>
                    </div>
                  </div>
                </div>
                <div class="nav-search-item-right">
                  <span style="font-weight: 800; color: var(--primary); font-size: 0.84rem;">${s.rate || 1.0} Cr/hr</span>
                  <span style="font-size: 0.7rem; color: var(--accent-amber); font-weight: 700;"><i class="fa-solid fa-star"></i> ${p.rating || 5.0}</span>
                </div>
              </div>
            `;
      }).join('')}
        </div>
        <div class="nav-search-footer-cta" onclick="window.app.viewAllSearchResults('${this.escapeQuotes(rawQuery)}')">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> View all ${matches.length} tutors in Explore Catalogue &rarr;
        </div>
      `;
    },

    handleGlobalSearchSelect(teacherId, skillName, hourlyRate = 2.5, tier = 'Elite Master') {
      const dropdown = document.getElementById('globalSearchResultsDropdown');
      if (dropdown) dropdown.style.display = 'none';

      const current = window.store?.getCurrentPersona();
      if (teacherId === current?.id) {
        this.switchView('view-profile');
        this.showToast('Navigated to your profile dashboard', 'user');
        return;
      }

      this.openBookingModal(teacherId, skillName, hourlyRate, tier);
      const teacher = window.store?.personas?.[teacherId];
      this.showToast(`🎯 Selected ${teacher?.name || 'Tutor'} (${skillName})`, 'check');
    },

    viewAllSearchResults(rawQuery) {
      const dropdown = document.getElementById('globalSearchResultsDropdown');
      if (dropdown) dropdown.style.display = 'none';

      const query = (rawQuery || '').trim();
      const exploreInput = document.getElementById('exploreSearchInput');
      if (exploreInput) exploreInput.value = query;

      this.switchView('view-explore');
      this.renderExploreCatalogue(query);
      this.showToast(`🔍 Showing all tutors matching "${query}"`, 'magnifying-glass');
    },

    async renderExploreCatalogue(searchQuery = '') {
      const grid = document.getElementById('exploreCardGrid');
      if (!grid) return;

      const current = window.store.getCurrentPersona();
      let peers = Object.values(window.store.personas).filter(p => !p.isAdmin && !p.is_admin);

      // Search Query
      const query = (searchQuery !== undefined && searchQuery !== '' ? searchQuery : (document.getElementById('exploreSearchInput')?.value || document.getElementById('globalSearchInput')?.value || '')).toLowerCase().trim();
      if (query) {
        peers = peers.filter(p =>
          (p.name || '').toLowerCase().includes(query) ||
          (p.skillsOffered || []).some(s =>
            (s.name || '').toLowerCase().includes(query) ||
            (s.description || s.desc || '').toLowerCase().includes(query) ||
            (s.tier || '').toLowerCase().includes(query) ||
            (s.category || '').toLowerCase().includes(query)
          ) ||
          (p.major || '').toLowerCase().includes(query) ||
          (p.college || '').toLowerCase().includes(query) ||
          (p.bio || '').toLowerCase().includes(query)
        );
      }

      // Category Filter
      const activeCat = (document.querySelector('[data-cat-filter].active')?.dataset.catFilter || 'all').toLowerCase();
      if (activeCat !== 'all') {
        peers = peers.filter(p => (p.skillsOffered || []).some(s => {
          const sCat = (s.category || '').toLowerCase();
          if (activeCat === 'tech') return sCat.includes('tech') || sCat.includes('cloud') || sCat.includes('data') || sCat.includes('cyber') || sCat.includes('code');
          if (activeCat === 'design') return sCat.includes('design') || sCat.includes('ui') || sCat.includes('ux');
          return sCat === activeCat;
        }));
      }

      // Credit Range Filter
      const activeCreditFilter = document.querySelector('[data-credit-filter].active')?.dataset.creditFilter || 'all';
      const getPrimaryRate = (p) => (p.skillsOffered && p.skillsOffered.length > 0) ? (Number(p.skillsOffered[0].rate) || 1.0) : 1.0;

      if (activeCreditFilter === 'low') {
        peers = peers.filter(p => getPrimaryRate(p) <= 1.5);
      } else if (activeCreditFilter === 'high') {
        peers = peers.filter(p => getPrimaryRate(p) >= 2.0);
      }

      // Sorting (Credits Low to High, Credits High to Low, Rating, Tier, Reviews)
      const sortMode = document.getElementById('exploreSortSelect')?.value || 'credits_asc';
      const tierRank = { 'Elite Master': 4, 'Advanced': 3, 'Silver': 2, 'Bronze': 1, 'Unverified': 0 };

      if (sortMode === 'credits_asc') {
        peers.sort((a, b) => getPrimaryRate(a) - getPrimaryRate(b));
      } else if (sortMode === 'credits_desc') {
        peers.sort((a, b) => getPrimaryRate(b) - getPrimaryRate(a));
      } else if (sortMode === 'rating') {
        peers.sort((a, b) => (Number(b.rating) || 5.0) - (Number(a.rating) || 5.0));
      } else if (sortMode === 'tier') {
        peers.sort((a, b) => {
          const aTier = a.skillsOffered?.[0]?.tier || 'Bronze';
          const bTier = b.skillsOffered?.[0]?.tier || 'Bronze';
          return (tierRank[bTier] || 0) - (tierRank[aTier] || 0);
        });
      } else if (sortMode === 'reviews') {
        peers.sort((a, b) => (Number(b.reviewsCount || b.reviews_count) || 0) - (Number(a.reviewsCount || a.reviews_count) || 0));
      }

      // Update count badge
      const countBadge = document.getElementById('exploreMentorsCountBadge');
      if (countBadge) {
        const sortLabel = sortMode === 'credits_asc' ? 'Low → High Credits' : sortMode === 'credits_desc' ? 'High → Low Credits' : sortMode === 'rating' ? 'Top Rated' : sortMode === 'tier' ? 'Top Tiers' : 'Most Reviews';
        countBadge.textContent = `Showing ${peers.length} Mentors • Sorted: ${sortLabel}`;
      }

      if (peers.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-xl);">
            <i class="fa-solid fa-magnifying-glass" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
            <h3>No mentors match your search or filter criteria</h3>
            <p style="color: var(--text-secondary); margin-top: 0.5rem;">Try adjusting your search terms or selecting 'All Credit Rates'.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = peers.map(peer => {
        const topSkill = peer.skillsOffered[0] || { name: 'Peer Mentoring', rate: 1.0, tier: 'Bronze' };

        return `
          <div class="match-card">
            <div class="card-user-header">
              ${window.getUserLogoCardHtml(peer, 52)}
              <div class="card-user-info">
                <h3>${peer.name} ${peer.id === current.id ? '<span style="font-size:0.75rem; color:var(--primary); font-weight:600;">(You)</span>' : ''}</h3>
                <div class="card-user-meta">${peer.major}</div>
              </div>
            </div>

            <p class="card-bio">${peer.bio}</p>

            <div style="margin-bottom: 1rem;">
              <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.35rem;">
                Courses Offered & 4-Tier Rates:
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                ${(peer.skillsOffered || []).map(s => `
                  <div style="background: var(--bg-subtle); padding: 0.45rem 0.65rem; border-radius: var(--radius-md); font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center;">
                    <span>
                      ${s.is_verified ? '<i class="fa-solid fa-shield-check" style="color:var(--accent-emerald);" title="Certified Mentor"></i> ' : ''}
                      <strong>${s.name}</strong> <span style="font-size: 0.72rem; color: var(--text-muted);">(${s.tier || s.level})</span>
                    </span>
                    <span style="font-weight: 800; color: var(--primary);">${s.rate || 1.0} Cr/hr</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="card-stats-bar">
              <div class="card-rating" title="Rating calculated strictly from student reviews">
                <i class="fa-solid fa-star"></i> ${peer.rating || '5.0'} (${peer.reviewsCount || peer.reviews_count || 5} student reviews)
              </div>
              <div style="color: var(--accent-emerald); font-weight: 600;">
                <i class="fa-solid fa-certificate"></i> NPTEL / Academic Verified
              </div>
            </div>

            <div class="card-actions">
              ${peer.id !== current.id ? `
                <button class="btn btn-secondary btn-sm" onclick="window.app.startDirectChat('${peer.id}')">
                  <i class="fa-regular fa-comment"></i> Chat
                </button>
                <button class="btn btn-primary btn-sm" onclick="window.app.openBookingModal('${peer.id}', '${topSkill.name}', ${topSkill.rate || 2.5}, '${topSkill.tier || 'Elite Master'}')">
                  <i class="fa-solid fa-calendar-plus"></i> Book (${topSkill.rate || 1.0} Cr/hr)
                </button>
              ` : `
                <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="window.app.switchView('view-profile')">
                  <i class="fa-solid fa-pen"></i> Edit My Profile & Certs
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');
    },

    async renderQuizzes() {
      await this.renderAssessmentCenter();
    },

    async renderAssessmentCenter() {
      try {
        const subjects = await window.store.fetchAssessmentSubjects();
        this.assessmentSubjects = subjects || [];
      } catch (e) {
        console.warn('Could not fetch assessment subjects', e);
        this.assessmentSubjects = [];
      }

      const countEl = document.getElementById('assessmentUserSubjectCount');
      if (countEl) {
        countEl.textContent = `${this.assessmentSubjects.length} Eligible Course${this.assessmentSubjects.length === 1 ? '' : 's'}`;
      }

      // If no subject selected or selected subject no longer in list, default to first
      if (!this.selectedAssessmentSubject || !this.assessmentSubjects.some(s => s.skill_name === this.selectedAssessmentSubject)) {
        if (this.assessmentSubjects.length > 0) {
          this.selectedAssessmentSubject = this.assessmentSubjects[0].skill_name;
        }
      }

      this.renderAssessmentSubjectsGrid();
      this.updateAssessmentConfigPreview();
      await this.renderAssessmentHistory();
    },

    async renderSessions() {
      const container = document.getElementById('sessionsTabContent');
      if (!container) return;

      if (!this.sessionsFilter) {
        this.sessionsFilter = 'UPCOMING';
      }

      // 1. Fetch categorized sessions from backend API
      const data = await window.store.fetchMySessions();
      const currentPersona = window.store.getCurrentPersona();

      // 2. Update dynamic tab counts
      const upcomingCount = data.counts?.upcoming || (data.upcoming || []).length;
      const pastCount = data.counts?.past || (data.past || []).length;
      const masterclassesCount = data.counts?.masterclasses || (data.masterclasses || []).length;
      const groupsCount = data.counts?.groups || (data.groups || []).length;
      const cancelledCount = data.counts?.cancelled || (data.cancelled || []).length;

      const tabUpcoming = document.getElementById('tabCountUpcoming');
      if (tabUpcoming) tabUpcoming.textContent = `Upcoming (${upcomingCount})`;
      const tabPast = document.getElementById('tabCountPast');
      if (tabPast) tabPast.textContent = `Past Sessions (${pastCount})`;
      const tabMasterclasses = document.getElementById('tabCountMasterclasses');
      if (tabMasterclasses) tabMasterclasses.textContent = `My Masterclasses (${masterclassesCount})`;
      const tabGroups = document.getElementById('tabCountGroups');
      if (tabGroups) tabGroups.textContent = `Group Sessions (${groupsCount})`;
      const tabCancelled = document.getElementById('tabCountCancelled');
      if (tabCancelled) tabCancelled.textContent = `Cancelled (${cancelledCount})`;

      // Dynamic sidebar badges for My Sessions & Book Swap
      const pendingReqs = (data.requests || []).filter(r => (r.status || '').toUpperCase() === 'PENDING').length;
      const pendingStudent = (data.studentPending || []).filter(sp => (sp.status || '').toUpperCase() === 'PENDING').length;
      const totalPendingSessions = pendingReqs + pendingStudent;

      const sidebarSessBadge = document.getElementById('sidebarSessionBadge');
      if (sidebarSessBadge) {
        sidebarSessBadge.textContent = totalPendingSessions > 99 ? '99+' : totalPendingSessions;
        sidebarSessBadge.style.display = totalPendingSessions > 0 ? 'inline-flex' : 'none';
      }

      const sidebarSwapBadge = document.getElementById('sidebarBookSwapBadge');
      if (sidebarSwapBadge) {
        sidebarSwapBadge.textContent = pendingReqs > 99 ? '99+' : pendingReqs;
        sidebarSwapBadge.style.display = pendingReqs > 0 ? 'inline-flex' : 'none';
      }

      // 3. Highlight active tab pill
      document.querySelectorAll('#sessionsFilterPills .session-tab-btn').forEach(btn => {
        if (btn.dataset.sessfilter === this.sessionsFilter) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      const currentTab = this.sessionsFilter;

      // Render based on active tab filter
      if (currentTab === 'UPCOMING') {
        const upcomingList = data.upcoming || [];
        const pastList = data.past || [];
        const groupsList = data.groups || [];
        const requestsList = data.requests || [];
        const studentPendingList = data.studentPending || [];

        container.innerHTML = `
          ${requestsList.length > 0 ? `
            <!-- Prominent Session Requests Section for Mentors -->
            <div class="sessions-section-box session-requests-card" style="border: 2px solid #f59e0b; background: linear-gradient(180deg, #fffdfa 0%, #ffffff 100%); margin-bottom: 1.5rem; border-radius: var(--radius-lg); padding: 1.25rem;">
              <div class="sessions-section-header" style="border-bottom: 1px solid #fde68a; padding-bottom: 0.75rem; margin-bottom: 1rem;">
                <div>
                  <h3 class="sessions-section-title" style="color: #b45309; font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem;">
                    <span style="width: 28px; height: 28px; border-radius: 50%; background: #fef3c7; color: #b45309; display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem;"><i class="fa-solid fa-bell"></i></span>
                    SESSION REQUESTS (${requestsList.length})
                  </h3>
                  <div class="sessions-section-subtitle">Review and accept or decline incoming 1-on-1 swap session requests.</div>
                </div>
              </div>
              <div class="session-requests-list" style="display: flex; flex-direction: column; gap: 1rem;">
                ${requestsList.map(req => this.renderSessionRequestCardHtml(req)).join('')}
              </div>
            </div>
          ` : ''}

          ${studentPendingList.length > 0 ? `
            <!-- Pending Requests Section for Students -->
            <div class="sessions-section-box" style="border: 1px solid #fde68a; background: #fffbeb; margin-bottom: 1.5rem; border-radius: var(--radius-lg); padding: 1.15rem;">
              <div class="sessions-section-header" style="border-bottom: 1px solid #fde68a; padding-bottom: 0.65rem; margin-bottom: 0.85rem;">
                <div>
                  <h4 class="sessions-section-title" style="font-size: 1rem; color: #b45309; font-weight: 800; display: flex; align-items: center; gap: 0.45rem;">
                    <span style="width: 26px; height: 26px; border-radius: 50%; background: #fef3c7; color: #b45309; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem;"><i class="fa-solid fa-clock-rotate-left"></i></span>
                    Waiting for Mentor Response (${studentPendingList.length})
                  </h4>
                  <div class="sessions-section-subtitle">Your session request has been sent. You will be notified when the mentor accepts or declines.</div>
                </div>
              </div>
              <div class="student-pending-list" style="display: flex; flex-direction: column; gap: 0.85rem;">
                ${studentPendingList.map(p => this.renderStudentPendingCardHtml(p)).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Main Section Box: Upcoming Sessions -->
          <div class="sessions-section-box">
            <div class="sessions-section-header">
              <div>
                <h3 class="sessions-section-title"><i class="fa-solid fa-calendar-check" style="color: var(--primary);"></i> Upcoming &amp; Accepted Sessions</h3>
                <div class="sessions-section-subtitle">Your scheduled 1-on-1 swaps and group masterclasses.</div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="btnViewCalendar" onclick="window.app.openSessionCalendarModal()">
                <i class="fa-solid fa-calendar-days"></i> View Calendar
              </button>
            </div>

            <div class="sessions-list-container">
              ${upcomingList.length > 0 ? upcomingList.map(sess => this.renderSessionRowCardHtml(sess, currentPersona)).join('') : `
                <div style="text-align: center; padding: 2.5rem 1rem; background: var(--bg-subtle); border-radius: var(--radius-lg); border: 1px dashed var(--border-medium);">
                  <i class="fa-solid fa-calendar-xmark" style="font-size: 2.2rem; color: var(--text-muted); margin-bottom: 0.5rem;"></i>
                  <h4 style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.25rem;">No Upcoming Accepted Sessions</h4>
                  <p style="font-size: 0.82rem; color: var(--text-secondary); max-width: 400px; margin: 0 auto 1rem;">Book a 1-on-1 swap or host a group live class to begin collaborating.</p>
                  <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                    <button class="btn btn-emerald btn-sm" onclick="window.app.openBookSwapModal()"><i class="fa-solid fa-plus"></i> Book a New Swap Session</button>
                    <button class="btn btn-secondary btn-sm" onclick="window.app.openHostCohortModal()"><i class="fa-solid fa-users"></i> Create a Masterclass</button>
                  </div>
                </div>
              `}
            </div>
          </div>

          <!-- Bottom Grid: Side-by-Side Cards (Recently Completed & Popular Group Sessions) -->
          <div class="sessions-bottom-grid">
            <!-- Left Card: Recently Completed Sessions -->
            <div class="sessions-section-box" style="margin-bottom: 0;">
              <div class="sessions-section-header">
                <div>
                  <h4 class="sessions-section-title" style="font-size: 1rem;">
                    <span style="width: 28px; height: 28px; border-radius: 50%; background: #dcfce7; color: #166534; display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem;"><i class="fa-solid fa-circle-check"></i></span>
                    Recently Completed Sessions
                  </h4>
                  <div class="sessions-section-subtitle">Your past learning sessions and feedback.</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.switchSessionsTab('PAST')">View All</button>
              </div>

              <div class="completed-sessions-list">
                ${pastList.length > 0 ? pastList.slice(0, 2).map(sess => this.renderCompletedMiniCardHtml(sess)).join('') : `
                  <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.82rem;">No past completed sessions yet.</div>
                `}
              </div>
            </div>

            <!-- Right Card: Popular Group Sessions -->
            <div class="sessions-section-box" style="margin-bottom: 0; background: linear-gradient(180deg, #ffffff 0%, rgba(99, 102, 241, 0.03) 100%); border-color: rgba(99, 102, 241, 0.2);">
              <div class="sessions-section-header">
                <div>
                  <h4 class="sessions-section-title" style="font-size: 1rem; color: var(--primary);">
                    <span style="width: 28px; height: 28px; border-radius: 50%; background: rgba(99, 102, 241, 0.12); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem;"><i class="fa-solid fa-users"></i></span>
                    Popular Group Sessions
                  </h4>
                  <div class="sessions-section-subtitle">Join upcoming group learning sessions.</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.switchSessionsTab('GROUPS')">View All</button>
              </div>

              <div class="popular-groups-list">
                ${groupsList.length > 0 ? groupsList.slice(0, 2).map(sess => this.renderPopularGroupMiniCardHtml(sess, currentPersona)).join('') : `
                  <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.82rem;">No group masterclasses available yet.</div>
                `}
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (currentTab === 'PAST') {
        const pastList = data.past || [];
        container.innerHTML = `
          <div class="sessions-section-box">
            <div class="sessions-section-header">
              <div>
                <h3 class="sessions-section-title"><i class="fa-solid fa-clock-rotate-left" style="color: var(--primary);"></i> Past Sessions (${pastList.length})</h3>
                <div class="sessions-section-subtitle">Sessions you have completed with ratings and released credits.</div>
              </div>
            </div>

            <div class="sessions-list-container">
              ${pastList.length > 0 ? pastList.map(sess => this.renderSessionRowCardHtml(sess, currentPersona)).join('') : `
                <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No completed past sessions found.</div>
              `}
            </div>
          </div>
        `;
        return;
      }

      if (currentTab === 'MASTERCLASSES') {
        const masterclassList = data.masterclasses || [];
        container.innerHTML = `
          <div class="sessions-section-box">
            <div class="sessions-section-header">
              <div>
                <h3 class="sessions-section-title"><i class="fa-solid fa-chalkboard-user" style="color: var(--accent-emerald);"></i> My Hosted Masterclasses (${masterclassList.length})</h3>
                <div class="sessions-section-subtitle">Live group cohort sessions created by you where earnings scale by attendee count ($N \times \text{Rate}$).</div>
              </div>
              <button class="btn btn-emerald btn-sm" onclick="window.app.openHostCohortModal()"><i class="fa-solid fa-plus"></i> Create a Masterclass</button>
            </div>

            <div class="sessions-list-container">
              ${masterclassList.length > 0 ? masterclassList.map(sess => this.renderSessionRowCardHtml(sess, currentPersona)).join('') : `
                <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">You have not hosted any group masterclasses yet. Click "Create a Masterclass" to launch one!</div>
              `}
            </div>
          </div>
        `;
        return;
      }

      if (currentTab === 'GROUPS') {
        const groupsList = data.groups || [];
        container.innerHTML = `
          <div class="sessions-section-box">
            <div class="sessions-section-header">
              <div>
                <h3 class="sessions-section-title"><i class="fa-solid fa-users" style="color: var(--primary);"></i> Group Learning Sessions (${groupsList.length})</h3>
                <div class="sessions-section-subtitle">Browse and register for live interactive group masterclasses hosted by peers and mentors.</div>
              </div>
            </div>

            <div class="sessions-list-container">
              ${groupsList.length > 0 ? groupsList.map(sess => this.renderSessionRowCardHtml(sess, currentPersona)).join('') : `
                <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No group learning sessions currently available.</div>
              `}
            </div>
          </div>
        `;
        return;
      }

      if (currentTab === 'CANCELLED') {
        const cancelledList = data.cancelled || [];
        container.innerHTML = `
          <div class="sessions-section-box">
            <div class="sessions-section-header">
              <div>
                <h3 class="sessions-section-title" style="color: #e11d48;"><i class="fa-solid fa-ban"></i> Cancelled Sessions (${cancelledList.length})</h3>
                <div class="sessions-section-subtitle">Sessions that were cancelled and refunded.</div>
              </div>
            </div>

            <div class="sessions-list-container">
              ${cancelledList.length > 0 ? cancelledList.map(sess => this.renderSessionRowCardHtml(sess, currentPersona)).join('') : `
                <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No cancelled sessions.</div>
              `}
            </div>
          </div>
        `;
        return;
      }
    },

    renderSessionRowCardHtml(sess, currentPersona) {
      const isCohort = sess.session_type === 'GROUP_COHORT';
      const isHost = sess.teacher_id === currentPersona.id;
      const isStudent = sess.student_id === currentPersona.id;
      const attendees = sess.attendees || [];
      const isEnrolled = attendees.some(a => a.student_id === currentPersona.id);
      const countN = sess.enrolled_count !== undefined ? sess.enrolled_count : attendees.length;
      const maxCapacity = sess.max_capacity || 30;
      const isFull = countN >= maxCapacity;

      const partnerId = isHost ? (sess.student_id || 'Students') : sess.teacher_id;
      const partnerName = isHost ? (isCohort ? `${countN} Enrolled Students` : (sess.studentName || partnerId)) : (sess.teacherName || partnerId);
      const partnerAvatar = window.getStudentAvatar(partnerId === 'Students' ? sess.teacher_id : partnerId);

      let monthStr = 'MAR';
      let dayStr = '15';
      let yearStr = '2025';
      if (sess.date) {
        const parts = sess.date.split('-');
        if (parts.length === 3) {
          const mNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
          monthStr = mNames[parseInt(parts[1], 10) - 1] || 'MAR';
          dayStr = parts[2];
          yearStr = parts[0];
        } else {
          monthStr = sess.date.substr(0, 3).toUpperCase();
        }
      }

      const st = (sess.status || '').toUpperCase();
      const isCompleted = st === 'COMPLETED' || st === 'ATTENDANCE_FINALIZED';
      const isCancelled = st === 'CANCELLED' || st === 'DECLINED';
      const isDeclined = st === 'DECLINED';
      const isAccepted = st === 'ACCEPTED' || st === 'CONFIRMED' || st === 'OPEN' || st === 'UPCOMING';
      const isPending = st === 'PENDING';

      let statusClass = 'confirmed';
      let statusLabel = 'Confirmed';
      if (isCompleted) {
        statusClass = 'completed';
        statusLabel = st === 'ATTENDANCE_FINALIZED' ? 'Attendance Finalized' : 'Completed';
      } else if (isDeclined) {
        statusClass = 'cancelled';
        statusLabel = 'Declined';
      } else if (isCancelled) {
        statusClass = 'cancelled';
        if (sess.cancelled_by === currentPersona.id) {
          statusLabel = 'CANCELLED';
        } else if (sess.cancelled_by && sess.cancelled_by === sess.student_id) {
          statusLabel = 'CANCELLED BY STUDENT';
        } else if (sess.cancelled_by && sess.cancelled_by === sess.teacher_id) {
          statusLabel = 'CANCELLED BY MENTOR';
        } else {
          statusLabel = 'CANCELLED';
        }
      } else if (isPending) {
        statusClass = 'pending';
        statusLabel = '🟡 Waiting for Mentor Response';
      } else if (isAccepted) {
        statusClass = 'confirmed';
        statusLabel = '🟢 Accepted';
      }

      const dropdownItems = [];
      if (isCohort) {
        dropdownItems.push(`<button type="button" class="session-dropdown-item" onclick="window.app.openMasterclassDetailsPage('${sess.id}')"><i class="fa-solid fa-circle-info"></i> View Details</button>`);
      } else {
        dropdownItems.push(`<button type="button" class="session-dropdown-item" onclick="window.app.openSessionDetailsModal('${sess.id}')"><i class="fa-solid fa-circle-info"></i> View Details</button>`);
      }

      const canEditCancel = isCohort ? isHost : (isHost || isStudent);
      if (!isCompleted && !isCancelled && !isPending && canEditCancel) {
        dropdownItems.push(`<button type="button" class="session-dropdown-item" onclick="window.app.openEditSession('${sess.id}')"><i class="fa-solid fa-pen-to-square"></i> ${isCohort ? 'Edit Masterclass' : 'Edit Details'}</button>`);
        dropdownItems.push(`<button type="button" class="session-dropdown-item" onclick="window.app.openRescheduleModal('${sess.id}')"><i class="fa-solid fa-calendar-days"></i> Reschedule</button>`);
        dropdownItems.push(`<button type="button" class="session-dropdown-item danger" onclick="window.app.openCancelModal('${sess.id}')"><i class="fa-solid fa-ban"></i> ${isCohort ? 'Cancel Masterclass' : 'Cancel Session'}</button>`);
      }
      dropdownItems.push(`<button type="button" class="session-dropdown-item" onclick="window.app.openReportIssueModal('${sess.id}')"><i class="fa-solid fa-flag"></i> Report Issue</button>`);

      return `
        <div class="session-row-card" ${isCohort ? `data-mc-hover-id="${sess.id}"` : ''}>
          <div class="session-row-left">
            <div class="session-date-box">
              <span class="session-date-month">${monthStr}</span>
              <span class="session-date-day">${dayStr}</span>
              <span class="session-date-year">${yearStr}</span>
            </div>
            <div class="session-row-info">
              <h4 class="session-row-title">${this.escapeHtml(sess.skill || 'Session')}</h4>
              <div class="session-type-badge">
                <i class="fa-solid ${isCohort ? 'fa-users' : 'fa-user'}"></i>
                ${isCohort ? `Group Masterclass (${countN} / ${maxCapacity} joined)` : '1-on-1 Swap Session'}
              </div>
              ${isCohort && !isHost ? `
                <div style="margin-top: 3px;">
                  <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 9999px; background: rgba(16, 185, 129, 0.12); color: #059669; font-weight: 700; font-size: 0.72rem;">
                    <i class="fa-solid fa-gift"></i> FREE TO JOIN — 0 CREDITS
                  </span>
                </div>
              ` : ''}
              ${!isCohort && isStudent && isAccepted ? `
                <div style="margin-top: 3px;">
                  <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 9999px; background: rgba(16, 185, 129, 0.12); color: #059669; font-weight: 700; font-size: 0.72rem;">
                    <i class="fa-solid fa-check"></i> ${this.escapeHtml(partnerName)} accepted your session request
                  </span>
                </div>
              ` : ''}
              ${!isCohort && isStudent && isDeclined ? `
                <div style="margin-top: 3px;">
                  <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 9999px; background: #fef2f2; color: #dc2626; font-weight: 700; font-size: 0.72rem;">
                    <i class="fa-solid fa-xmark"></i> ${this.escapeHtml(partnerName)} declined your request • Credits refunded
                  </span>
                </div>
              ` : ''}
              ${!isCohort && isCancelled ? `
                <div style="margin-top: 3px;">
                  <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 9999px; background: #fef2f2; color: #dc2626; font-weight: 700; font-size: 0.72rem;">
                    <i class="fa-solid fa-ban"></i> Status: CANCELLED • Cancelled by: ${sess.cancelled_by === currentPersona.id ? 'You' : (sess.cancelled_by === sess.student_id ? 'Student' : 'Mentor')}
                  </span>
                </div>
              ` : ''}
              <div class="session-meta-line" style="margin-top: 4px;">
                <span><i class="fa-regular fa-clock"></i> ${sess.time || '10:00 AM – 11:00 AM'} (${sess.hours || 1} hour)</span>
                <span><i class="fa-solid fa-video"></i> ${sess.code_workspace ? 'Google Meet' : 'Zoom'}</span>
              </div>
            </div>
          </div>

          <div class="session-row-middle">
            <div class="session-mentor-profile">
              <img src="${partnerAvatar}" class="session-mentor-avatar" onerror="window.handleAvatarError(this, '${partnerId}')">
              <div>
                <div class="session-mentor-name">${isCohort ? (isHost ? 'Hosted by: You (Host)' : `Hosted by: ${this.escapeHtml(sess.teacherName || partnerName)}`) : this.escapeHtml(partnerName)}</div>
                <div class="session-mentor-sub">${isCohort ? (isHost ? `Your Masterclass • ${countN} / ${maxCapacity} joined` : 'Free Public Group Class') : `Peer Mentor • ${sess.rate || 2.5} Cr/hr`}</div>
              </div>
            </div>

            <span class="session-status-badge ${statusClass}">
              ● ${statusLabel}
            </span>
          </div>

          <div class="session-row-right">
            ${isCohort ? `
              ${!isCompleted && !isCancelled ? `
                ${isHost ? `
                  <button type="button" class="btn btn-dark btn-sm" style="background: #0f172a; color: #fff;" onclick="window.app.openLiveRoom('${sess.id}')">
                    Enter Live Room
                  </button>
                  <button type="button" class="btn btn-emerald btn-sm" onclick="window.app.concludeCohortSession('${sess.id}')" title="End session and finalize attendance-based reward">
                    <i class="fa-solid fa-flag-checkered"></i> Finalize Attendance
                  </button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="window.app.openEditMasterclass('${sess.id}')" title="Edit Masterclass">
                    <i class="fa-solid fa-pen-to-square"></i> Edit
                  </button>
                  <button type="button" class="btn btn-outline btn-sm danger" style="color: #e11d48; border-color: #fecdd3;" onclick="window.app.openCancelModal('${sess.id}')" title="Cancel Masterclass">
                    <i class="fa-solid fa-ban"></i> Cancel
                  </button>
                ` : `
                  ${!isEnrolled ? `
                    <button type="button" class="btn ${isFull ? 'btn-secondary' : 'btn-primary'} btn-sm" ${isFull ? 'disabled' : ''} onclick="window.app.enrollInLiveCohort('${sess.id}')">
                      ${isFull ? 'FULL' : 'Join Session'}
                    </button>
                  ` : `
                    <span class="session-status-badge confirmed" style="font-size: 0.75rem;">Registered</span>
                    <button type="button" class="btn btn-dark btn-sm" style="background: #0f172a; color: #fff;" onclick="window.app.openLiveRoom('${sess.id}')">
                      Enter Live Session
                    </button>
                  `}
                `}
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openMasterclassDetailsPage('${sess.id}')">
                  View Details
                </button>
              ` : `
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openMasterclassDetailsPage('${sess.id}')">
                  View Details
                </button>
              `}
            ` : `
              <!-- 1-on-1 Swap Session Actions -->
              ${isPending ? `
                ${isHost ? `
                  <button type="button" class="btn btn-emerald btn-sm" onclick="window.app.acceptSwapSession('${sess.id}')">
                    <i class="fa-solid fa-check"></i> Accept
                  </button>
                  <button type="button" class="btn btn-outline btn-sm" style="color: #dc2626; border-color: #fca5a5;" onclick="window.app.openDeclineModal('${sess.id}', '${this.escapeHtml(sess.skill)}')">
                    <i class="fa-solid fa-xmark"></i> Decline
                  </button>
                ` : `
                  <button type="button" class="btn btn-outline btn-sm danger" onclick="window.app.openCancelModal('${sess.id}')">
                    Cancel Request
                  </button>
                `}
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openSessionDetailsModal('${sess.id}')">
                  View Details
                </button>
              ` : isAccepted ? `
                <button type="button" class="btn btn-dark btn-sm" style="background: #0f172a; color: #fff;" onclick="window.app.openLiveRoom('${sess.id}')">
                  <i class="fa-solid fa-video"></i> ${isHost ? 'Enter Live Room' : 'Join Session'}
                </button>
                ${isHost ? `
                  <button type="button" class="btn btn-emerald btn-sm" onclick="window.app.openFinalizeSwapModal('${sess.id}')">
                    <i class="fa-solid fa-flag-checkered"></i> Finalize Attendance
                  </button>
                ` : ''}
                ${canEditCancel ? `
                  <button type="button" class="btn btn-outline btn-sm" onclick="window.app.openEditSession('${sess.id}')" title="Edit Session">
                    <i class="fa-solid fa-pen-to-square"></i> Edit
                  </button>
                ` : ''}
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openSessionDetailsModal('${sess.id}')">
                  View Details
                </button>
              ` : `
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openSessionDetailsModal('${sess.id}')">
                  View Details
                </button>
              `}
            `}

            <div style="position: relative;">
              <button type="button" class="session-kebab-btn" onclick="window.app.toggleKebabMenu(this)" title="More options">
                <i class="fa-solid fa-ellipsis"></i>
              </button>
              <div class="session-dropdown-menu">
                ${dropdownItems.join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    },

    renderSessionRequestCardHtml(req) {
      const studentName = req.studentName || req.student?.name || req.student_id;
      const studentAvatar = window.getStudentAvatar(req.student_id);
      const hours = req.hours || 1;
      const rate = req.rate || 2.5;
      const totalEarned = (hours * rate).toFixed(1);
      const desc = req.description || req.additional_notes || 'Student requested help with ' + (req.topic || req.skill);
      const isCancelled = (req.status || '').toUpperCase() === 'CANCELLED';
      const isDeclined = (req.status || '').toUpperCase() === 'DECLINED';

      return `
        <div class="card session-request-box" style="background: #ffffff; border: 1px solid ${isCancelled || isDeclined ? '#fca5a5' : '#fed7aa'}; border-radius: 12px; padding: 1.35rem; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.08);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
            <div>
              <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: ${isCancelled || isDeclined ? '#dc2626' : '#b45309'}; letter-spacing: 0.5px; margin-bottom: 0.25rem;">
                <i class="fa-solid ${isCancelled || isDeclined ? 'fa-ban' : 'fa-bolt'}"></i> ${isCancelled ? 'Cancelled Session Request' : isDeclined ? 'Declined Session Request' : 'New Swap Session Request'}
              </div>
              <h4 style="margin: 0 0 0.25rem; font-size: 1.15rem; font-weight: 800; color: #0f172a;">
                ${this.escapeHtml(req.topic || req.skill)}
              </h4>
              <div style="font-size: 0.85rem; font-weight: 600; color: #2563eb;">
                📚 ${this.escapeHtml(req.skill)}
              </div>
            </div>

            <div style="text-align: right;">
              ${isCancelled ? `
                <span class="session-status-badge cancelled" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; font-weight: 700;">
                  ● CANCELLED BY STUDENT
                </span>
                <div style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-top: 0.35rem;">
                  Cancelled • 0 Credits transferred
                </div>
              ` : isDeclined ? `
                <span class="session-status-badge cancelled" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; font-weight: 700;">
                  ● DECLINED
                </span>
                <div style="font-size: 0.82rem; font-weight: 700; color: #94a3b8; margin-top: 0.35rem;">
                  Declined by you • Escrow refunded
                </div>
              ` : `
                <span class="session-status-badge pending" style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a;">
                  ● PENDING ACCEPTANCE
                </span>
                <div style="font-size: 0.82rem; font-weight: 700; color: #059669; margin-top: 0.35rem;">
                  Earn: +${totalEarned} Credits on completion
                </div>
              `}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.85rem; background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 10px; padding: 0.85rem 1.1rem; margin-bottom: 1rem; font-size: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <img src="${studentAvatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid #cbd5e1;" onerror="window.handleAvatarError(this, '${req.student_id}')">
              <div>
                <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">👤 Requested By</div>
                <div style="font-weight: 700; color: #0f172a;">${this.escapeHtml(studentName)}</div>
              </div>
            </div>

            <div>
              <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">📅 Date & Time</div>
              <div style="font-weight: 700; color: #0f172a;">${req.date} • ${req.time || '10:00 AM – 11:00 AM'}</div>
            </div>

            <div>
              <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">⏱ Duration & Platform</div>
              <div style="font-weight: 700; color: #0f172a;">${hours} Hour${hours > 1 ? 's' : ''} • 🎥 ${this.escapeHtml(req.platform || req.meeting_platform || 'Google Meet')}</div>
            </div>
          </div>

          <div style="margin-bottom: 1.25rem; font-size: 0.88rem; color: #334155; line-height: 1.5; background: #fffdfa; border-left: 3px solid ${isCancelled || isDeclined ? '#ef4444' : '#f59e0b'}; padding: 0.65rem 0.9rem; border-radius: 0 8px 8px 0; border-top: 1px solid #fed7aa; border-right: 1px solid #fed7aa; border-bottom: 1px solid #fed7aa;">
            <div style="font-size: 0.75rem; font-weight: 700; color: ${isCancelled || isDeclined ? '#dc2626' : '#b45309'}; text-transform: uppercase; margin-bottom: 0.2rem;">Student's Request:</div>
            <em>"${this.escapeHtml(desc)}"</em>
          </div>

          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openSessionDetailsModal('${req.id}')">
              <i class="fa-regular fa-eye"></i> View Details
            </button>
            ${!isCancelled && !isDeclined ? `
              <button type="button" class="btn btn-outline btn-sm" style="color: #dc2626; border-color: #fca5a5;" onclick="window.app.openDeclineModal('${req.id}', '${this.escapeHtml(req.topic || req.skill)}')">
                <i class="fa-solid fa-xmark"></i> Decline
              </button>
              <button type="button" class="btn btn-emerald btn-sm" onclick="window.app.acceptSwapSession('${req.id}')" style="background: #059669; color: #fff; font-weight: 700;">
                <i class="fa-solid fa-check"></i> Accept Session
              </button>
            ` : ''}
          </div>
        </div>
      `;
    },

    renderStudentPendingCardHtml(sess) {
      const mentorName = sess.teacherName || sess.teacher?.name || 'Mentor';
      const mentorAvatar = window.getStudentAvatar(sess.teacher_id);
      const hours = sess.hours || 1;
      const isDeclined = (sess.status || '').toUpperCase() === 'DECLINED';

      return `
        <div class="card" style="background: #ffffff; border: 1px solid ${isDeclined ? '#fca5a5' : '#fde68a'}; border-radius: 12px; padding: 1.15rem; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <h4 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #0f172a;">${this.escapeHtml(sess.topic || sess.skill)}</h4>
                <span class="badge" style="background: #eff6ff; color: #2563eb; font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 9999px;">1-on-1 Swap</span>
              </div>
              <div style="font-size: 0.82rem; color: #64748b; margin-bottom: 0.5rem;">
                Requested Mentor: <strong style="color: #1e293b;">${this.escapeHtml(mentorName)}</strong> • 📅 ${sess.date} • 🕐 ${sess.time || '10:00 AM – 11:00 AM'} (${hours}hr)
              </div>
              ${isDeclined ? `
                <div style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.75rem; border-radius: 20px; background: #fee2e2; color: #dc2626; font-weight: 700; font-size: 0.78rem; border: 1px solid #fca5a5;">
                  <span style="width: 7px; height: 7px; border-radius: 50%; background: #dc2626;"></span> ● DECLINED BY MENTOR
                </div>
                <p style="margin: 0.4rem 0 0; font-size: 0.8rem; color: #dc2626; font-weight: 600;">
                  ${this.escapeHtml(mentorName)} declined your request • Escrow credits refunded to your wallet.
                </p>
              ` : `
                <div style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.75rem; border-radius: 20px; background: #fef3c7; color: #b45309; font-weight: 700; font-size: 0.78rem; border: 1px solid #fde68a;">
                  <span style="width: 7px; height: 7px; border-radius: 50%; background: #f59e0b;"></span> 🟡 Waiting for Mentor Response
                </div>
                <p style="margin: 0.4rem 0 0; font-size: 0.8rem; color: #64748b;">
                  Your session request has been sent to ${this.escapeHtml(mentorName)}. You will be notified when the mentor accepts or declines.
                </p>
              `}
            </div>

            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openSessionDetailsModal('${sess.id}')">
                View Details
              </button>
              ${!isDeclined ? `
                <button type="button" class="btn btn-outline btn-sm danger" onclick="window.app.openCancelModal('${sess.id}')" title="Cancel request and unlock escrow credits">
                  Cancel Request
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    },

    renderCompletedMiniCardHtml(sess) {
      let monthStr = 'MAR';
      let dayStr = '10';
      if (sess.date) {
        const parts = sess.date.split('-');
        if (parts.length === 3) {
          const mNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
          monthStr = mNames[parseInt(parts[1], 10) - 1] || 'MAR';
          dayStr = parts[2];
        }
      }

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0.9rem; background: var(--bg-subtle); border-radius: var(--radius-md); margin-bottom: 0.6rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="session-date-box" style="width: 48px; height: 48px;">
              <span class="session-date-month" style="font-size: 0.6rem;">${monthStr}</span>
              <span class="session-date-day" style="font-size: 1rem;">${dayStr}</span>
            </div>
            <div>
              <div style="font-size: 0.9rem; font-weight: 800; color: var(--text-primary);">${sess.skill}</div>
              <div style="font-size: 0.74rem; color: var(--text-secondary);">
                ${sess.teacherName || 'Peer Mentor'} • ${sess.status === 'ATTENDANCE_FINALIZED' ? 'Attendance Finalized' : 'Completed'}
              </div>
            </div>
          </div>
          <div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openSessionDetailsModal('${sess.id}')">View</button>
          </div>
        </div>
      `;
    },

    renderPopularGroupMiniCardHtml(sess, currentPersona) {
      let monthStr = 'MAR';
      let dayStr = '20';
      if (sess.date) {
        const parts = sess.date.split('-');
        if (parts.length === 3) {
          const mNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
          monthStr = mNames[parseInt(parts[1], 10) - 1] || 'MAR';
          dayStr = parts[2];
        }
      }

      const attendees = sess.attendees || [];
      const isEnrolled = attendees.some(a => a.student_id === currentPersona.id);
      const isHost = sess.teacher_id === currentPersona.id;
      const countN = sess.enrolled_count !== undefined ? sess.enrolled_count : attendees.length;
      const maxCapacity = sess.max_capacity || 30;
      const isFull = countN >= maxCapacity;

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0.9rem; background: #ffffff; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); margin-bottom: 0.6rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="session-date-box" style="width: 48px; height: 48px; background: rgba(99, 102, 241, 0.12);">
              <span class="session-date-month" style="font-size: 0.6rem;">${monthStr}</span>
              <span class="session-date-day" style="font-size: 1rem;">${dayStr}</span>
            </div>
            <div>
              <div style="font-size: 0.9rem; font-weight: 800; color: #0f172a;">${sess.skill}</div>
              <div style="font-size: 0.74rem; color: #059669; font-weight: 700;">
                <i class="fa-solid fa-gift"></i> FREE TO JOIN — 0 CREDITS
              </div>
              <div style="font-size: 0.72rem; color: #64748b;">
                Hosted by: ${isHost ? 'You (Host)' : (sess.teacherName || 'Peer Mentor')} • ${countN} / ${maxCapacity} joined
              </div>
            </div>
          </div>
          <div>
            ${isHost ? `
              <button type="button" class="btn btn-dark btn-sm" style="background: #0f172a; color: #fff; padding: 0.35rem 0.85rem; font-size: 0.78rem;" onclick="window.app.openLiveRoom('${sess.id}')">
                Host Room
              </button>
            ` : isEnrolled ? `
              <button type="button" class="btn btn-dark btn-sm" style="background: #0f172a; color: #fff; padding: 0.35rem 0.85rem; font-size: 0.78rem;" onclick="window.app.openLiveRoom('${sess.id}')">
                Enter
              </button>
            ` : `
              <button type="button" class="btn ${isFull ? 'btn-secondary' : 'btn-primary'} btn-sm" style="background: ${isFull ? '' : '#2563eb'}; color: #fff; padding: 0.35rem 0.85rem; font-size: 0.78rem;" ${isFull ? 'disabled' : ''} onclick="window.app.enrollInLiveCohort('${sess.id}')">
                ${isFull ? 'FULL' : 'Join Session'}
              </button>
            `}
          </div>
        </div>
      `;
    },

    openBookSwapModal() {
      this.startBookingFlow();
    },

    switchSessionsTab(tabKey) {
      this.sessionsFilter = tabKey;
      this.renderSessions();
    },

    toggleKebabMenu(btn) {
      document.querySelectorAll('.session-dropdown-menu.show').forEach(m => {
        if (m !== btn.nextElementSibling) m.classList.remove('show');
      });
      const menu = btn.nextElementSibling;
      if (menu) menu.classList.toggle('show');
    },

    async openRescheduleModal(sessionId) {
      const sess = (window.store.sessions || []).find(s => s.id === sessionId) || await window.store.getSessionDetails(sessionId);
      if (!sess) return alert('Session not found');

      document.getElementById('rescheduleSessionId').value = sess.id;
      document.getElementById('rescheduleSessionTitle').textContent = sess.skill;
      document.getElementById('rescheduleCurrentTimeDisplay').textContent = `Current: ${sess.date} (${sess.time})`;
      document.getElementById('rescheduleDateInput').value = sess.date || '';
      document.getElementById('rescheduleTimeInput').value = sess.time || '';

      this.openModal('rescheduleSessionModal');
    },

    startSessionsLivePolling() {
      this.stopSessionsLivePolling();
      this.sessionsLivePollInterval = setInterval(async () => {
        if (this.currentView !== 'view-sessions') {
          this.stopSessionsLivePolling();
          return;
        }
        try {
          const newData = await window.store.fetchMySessions();
          // Fingerprint contains all session IDs, status, cancelled_by, and tab counts
          const newFingerprint = (newData.all || []).map(s => `${s.id}:${s.status}:${s.cancelled_by}:${s.declined_by_user_id}`).join('|') + `|${newData.counts?.upcoming || 0}|${newData.counts?.cancelled || 0}`;
          if (this._sessionsFingerprint && this._sessionsFingerprint !== newFingerprint) {
            await this.renderSessions();
          }
          this._sessionsFingerprint = newFingerprint;
        } catch (e) { }
      }, 2500);
    },

    stopSessionsLivePolling() {
      if (this.sessionsLivePollInterval) {
        clearInterval(this.sessionsLivePollInterval);
        this.sessionsLivePollInterval = null;
      }
    },

    async openCancelModal(sessionId) {
      const cats = window.store.categorizedSessions || {};
      let sess = (window.store.sessions || []).find(s => s.id === sessionId) ||
        (cats.all || []).find(s => s.id === sessionId) ||
        (cats.studentPending || []).find(s => s.id === sessionId) ||
        (cats.requests || []).find(s => s.id === sessionId) ||
        (cats.upcoming || []).find(s => s.id === sessionId) ||
        (cats.masterclasses || []).find(s => s.id === sessionId) ||
        (cats.cancelled || []).find(s => s.id === sessionId);

      if (!sess) {
        try {
          sess = await window.store.getSessionDetails(sessionId);
        } catch (e) { }
      }
      if (!sess) return alert('Session not found');

      const isCohort = sess.session_type === 'GROUP_COHORT';
      const isPending = (sess.status || '').toUpperCase() === 'PENDING';
      const titleEl = document.getElementById('cancelModalHeaderTitle');
      const questionEl = document.getElementById('cancelConfirmQuestion');
      const noticeEl = document.getElementById('cancelSessionNotice');
      const confirmBtn = document.getElementById('confirmCancelSessionBtn');
      const keepBtn = document.getElementById('keepSessionBtn');

      document.getElementById('cancelSessionId').value = sess.id;
      if (document.getElementById('cancelReasonInput')) {
        document.getElementById('cancelReasonInput').value = '';
      }

      if (isCohort) {
        const mcTitle = sess.topic || sess.skill || 'this masterclass';
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Cancel Masterclass';
        if (questionEl) questionEl.innerHTML = `Are you sure you want to cancel this masterclass "<strong id="cancelSessionTitle">${this.escapeHtml(mcTitle)}</strong>"?`;
        if (noticeEl) noticeEl.textContent = 'Registered participants will be notified and registrations cancelled.';
        if (confirmBtn) confirmBtn.innerHTML = '<i class="fa-solid fa-ban"></i> Cancel Masterclass';
        if (keepBtn) keepBtn.textContent = 'Keep Masterclass';
      } else if (isPending) {
        const mentorName = sess.teacherName || sess.teacher?.name || 'Mentor';
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Cancel this session request?';
        if (questionEl) questionEl.innerHTML = `Are you sure you want to cancel your request to <strong id="cancelSessionTitle">${this.escapeHtml(mentorName)}</strong>?`;
        if (noticeEl) noticeEl.textContent = 'Your session request has not been accepted yet. Any locked credits will be immediately released back to your wallet.';
        if (confirmBtn) confirmBtn.innerHTML = '<i class="fa-solid fa-ban"></i> Yes, Cancel Request';
        if (keepBtn) keepBtn.textContent = 'Keep Request';
      } else {
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Cancel Session';
        if (questionEl) questionEl.innerHTML = `Are you sure you want to cancel <strong id="cancelSessionTitle">"${this.escapeHtml(sess.skill || 'this session')}"</strong>?`;
        if (noticeEl) noticeEl.textContent = 'Any locked credits will be automatically refunded to the student\'s wallet.';
        if (confirmBtn) confirmBtn.innerHTML = '<i class="fa-solid fa-ban"></i> Cancel Session';
        if (keepBtn) keepBtn.textContent = 'Keep Session';
      }

      this.openModal('cancelSessionModal');
    },

    async openSessionDetailsModal(sessionId) {
      const modalBody = document.getElementById('sessionDetailsModalBody');
      if (!modalBody) return;

      modalBody.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading session details...</div>';
      this.openModal('sessionDetailsModal');

      try {
        const sess = await window.store.getSessionDetails(sessionId);
        const isCohort = sess.session_type === 'GROUP_COHORT';
        const attendees = sess.attendees || [];
        const st = (sess.status || '').toUpperCase();

        const mentorName = sess.teacher ? sess.teacher.name : (sess.teacherName || sess.teacher_id || 'Mentor');
        const studentName = sess.student ? sess.student.name : (sess.studentName || sess.student_id || 'Student');

        let statusBadge = '';
        if (st === 'CANCELLED') {
          const who = sess.cancelled_by === sess.student_id ? 'STUDENT' : (sess.cancelled_by === sess.teacher_id ? 'MENTOR' : '');
          statusBadge = `<span class="session-status-badge cancelled" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; font-weight: 700;">● CANCELLED${who ? ' BY ' + who : ''}</span>`;
        } else if (st === 'DECLINED') {
          statusBadge = `<span class="session-status-badge cancelled" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; font-weight: 700;">● DECLINED BY MENTOR</span>`;
        } else if (st === 'PENDING') {
          statusBadge = `<span class="session-status-badge pending" style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; font-weight: 700;">● WAITING FOR MENTOR RESPONSE</span>`;
        } else if (st === 'COMPLETED' || st === 'ATTENDANCE_FINALIZED') {
          statusBadge = `<span class="session-status-badge completed">● COMPLETED</span>`;
        } else {
          statusBadge = `<span class="session-status-badge confirmed">● ${this.escapeHtml(sess.status || 'ACCEPTED')}</span>`;
        }

        modalBody.innerHTML = `
          <div style="display: flex; gap: 0.75rem; align-items: center; background: var(--bg-subtle); padding: 0.75rem; border-radius: var(--radius-md);">
            <div class="session-date-box" style="width: 54px; height: 54px;">
              <span class="session-date-month">${sess.date ? sess.date.substr(0, 7) : '2026'}</span>
              <span class="session-date-day">${sess.date ? sess.date.split('-')[2] || '14' : '14'}</span>
            </div>
            <div style="flex: 1;">
              <h4 style="font-size: 1.1rem; font-weight: 800; margin: 0; color: #0f172a;">${this.escapeHtml(sess.topic || sess.skill || 'Session')}</h4>
              <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700; margin-top: 0.15rem;">
                ${isCohort ? `Group Masterclass (${attendees.length} Students)` : '1-on-1 Swap Session'} • 📚 ${this.escapeHtml(sess.skill || 'Topic')}
              </div>
            </div>
            ${statusBadge}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.85rem;">
            <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); padding: 0.75rem; border-radius: var(--radius-md);">
              <div style="font-weight: 700; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Mentor</div>
              <div style="font-weight: 800; font-size: 0.95rem; margin-top: 0.2rem;">${this.escapeHtml(mentorName)}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${sess.teacher?.college || 'Vignan University'}</div>
            </div>

            <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); padding: 0.75rem; border-radius: var(--radius-md);">
              <div style="font-weight: 700; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Requester / Student</div>
              <div style="font-weight: 800; font-size: 0.95rem; margin-top: 0.2rem;">${isCohort ? `${attendees.length} Enrolled Students` : this.escapeHtml(studentName)}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${isCohort ? `Max Capacity: ${sess.max_capacity || 30}` : (sess.student?.college || 'Vignan University')}</div>
            </div>
          </div>

          <div style="font-size: 0.85rem; line-height: 1.6; background: var(--bg-subtle); padding: 0.85rem; border-radius: var(--radius-md);">
            <div><strong>Session:</strong> ${this.escapeHtml(sess.topic || sess.skill || 'Problem Solving')}</div>
            <div><strong>Subject:</strong> ${this.escapeHtml(sess.skill || 'Python Programming')}</div>
            <div><strong>Date:</strong> ${sess.date || '2026-09-14'}</div>
            <div><strong>Time:</strong> ${sess.time || '10:00 AM'}</div>
            <div><strong>Duration:</strong> ${sess.hours || 1} Hour${(sess.hours || 1) > 1 ? 's' : ''}</div>
            <div><strong>Platform:</strong> ${this.escapeHtml(sess.code_workspace ? 'Google Meet' : (sess.platform || sess.meeting_platform || 'Google Meet'))}</div>
            <div><strong>Credit:</strong> ${sess.credits || 1} Credit${(sess.credits || 1) > 1 ? 's' : ''}</div>
            <div><strong>Status:</strong> ${st === 'PENDING' ? 'Waiting for Mentor Response' : st === 'DECLINED' ? 'Declined by Mentor' : st === 'CANCELLED' ? 'Cancelled' : (sess.status || 'Accepted')}</div>
            ${sess.description || sess.additional_notes || sess.topic ? `
              <div style="margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px dashed var(--border-subtle);">
                <strong>Request Message:</strong> "${this.escapeHtml(sess.description || sess.additional_notes || sess.topic)}"
              </div>
            ` : ''}
          </div>

          <div style="display: flex; gap: 0.65rem; justify-content: flex-end; flex-wrap: wrap; margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--border-subtle);">
            ${st !== 'COMPLETED' && st !== 'CANCELLED' && st !== 'DECLINED' && st !== 'PENDING' ? `
              <button type="button" class="btn btn-outline btn-sm" onclick="window.app.closeModal('sessionDetailsModal'); window.app.restorePageScroll(); window.app.openEditSession('${sess.id}')" style="border: 1px solid #cbd5e1; color: #1e293b; padding: 0.45rem 0.85rem; border-radius: 6px; font-weight: 600; cursor: pointer;">
                <i class="fa-solid fa-pen-to-square"></i> ${isCohort ? 'Edit Masterclass' : 'Edit Session'}
              </button>
              <button type="button" class="btn btn-outline btn-sm" onclick="window.app.closeModal('sessionDetailsModal'); window.app.restorePageScroll(); window.app.openRescheduleModal('${sess.id}')" style="border: 1px solid #cbd5e1; color: #1e293b; padding: 0.45rem 0.85rem; border-radius: 6px; font-weight: 600; cursor: pointer;">
                <i class="fa-solid fa-calendar-days"></i> Reschedule
              </button>
            ` : ''}
            <button type="button" class="btn btn-outline btn-sm" onclick="window.app.closeModal('sessionDetailsModal'); window.app.restorePageScroll(); window.app.openReportIssueModal('${sess.id}')" style="border: 1px solid #fecaca; color: #dc2626; padding: 0.45rem 0.85rem; border-radius: 6px; font-weight: 600; cursor: pointer;">
              <i class="fa-solid fa-flag"></i> Report Issue / Dispute
            </button>
          </div>
        `;
      } catch (err) {
        modalBody.innerHTML = `<div style="color: #e11d48; text-align: center; padding: 1.5rem;">Failed to load details: ${err.message}</div>`;
      }
    },

    async openSessionFeedbackModal(sessionId) {
      const modalBody = document.getElementById('sessionFeedbackModalBody');
      if (!modalBody) return;

      modalBody.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading feedback...</div>';
      this.openModal('sessionFeedbackModal');

      try {
        const sess = await window.store.getSessionDetails(sessionId);
        const fb = sess.feedback;

        modalBody.innerHTML = `
          <div style="background: var(--bg-subtle); padding: 1rem; border-radius: var(--radius-md); text-align: center;">
            <div style="font-size: 1.8rem; color: #f59e0b; margin-bottom: 0.25rem;">
              ${'★'.repeat(fb?.rating || 5)}${'☆'.repeat(5 - (fb?.rating || 5))}
            </div>
            <div style="font-weight: 800; font-size: 1.1rem; color: #0f172a;">${fb?.rating || 5}.0 / 5.0 Rating</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Feedback provided by <strong>${fb?.reviewerName || 'Student'}</strong></div>
          </div>

          <div style="background: #ffffff; border: 1px solid var(--border-subtle); padding: 1rem; border-radius: var(--radius-md);">
            <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Review Comment:</div>
            <p style="font-size: 0.9rem; color: var(--text-primary); font-style: italic; line-height: 1.5; margin: 0;">
              "${fb?.comment || 'Great session! Learned practical skills and solved code issues effectively.'}"
            </p>
          </div>

          <div>
            <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.4rem;">Endorsement Tags:</div>
            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
              ${(fb?.tags || ['Peer Learning', 'Clear Explanations', 'Code Debugged']).map(t => `
                <span class="student-badge" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); font-weight: 700;">
                  <i class="fa-solid fa-tag"></i> ${t}
                </span>
              `).join('')}
            </div>
          </div>
        `;
      } catch (err) {
        modalBody.innerHTML = `<div style="color: #e11d48; text-align: center; padding: 1.5rem;">Failed to load feedback: ${err.message}</div>`;
      }
    },

    openSessionCalendarModal() {
      const modalBody = document.getElementById('sessionCalendarModalBody');
      if (!modalBody) return;

      const sessions = window.store.sessions || [];
      this.openModal('sessionCalendarModal');

      modalBody.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; text-align: center; font-weight: 800; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">
          <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem;">
          ${Array.from({ length: 31 }, (_, i) => {
        const dayNum = i + 1;
        const daySessions = sessions.filter(s => {
          if (!s.date) return false;
          const d = parseInt(s.date.split('-')[2] || '0', 10);
          return d === dayNum;
        });
        return `
              <div style="min-height: 75px; background: ${daySessions.length > 0 ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-subtle)'}; border: 1px solid ${daySessions.length > 0 ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-subtle)'}; border-radius: var(--radius-md); padding: 0.4rem; font-size: 0.75rem;">
                <div style="font-weight: 800; color: ${daySessions.length > 0 ? 'var(--primary)' : 'var(--text-muted)'}; text-align: right;">${dayNum}</div>
                ${daySessions.map(s => `
                  <div style="background: #0f172a; color: #fff; border-radius: 0.25rem; padding: 0.15rem 0.3rem; font-size: 0.65rem; margin-top: 0.25rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;" onclick="window.app.openSessionDetailsModal('${s.id}')">
                    ${s.skill}
                  </div>
                `).join('')}
              </div>
            `;
      }).join('')}
        </div>
      `;
    },

    async openLiveRoom(sessionId) {
      try {
        let sess = (window.store.sessions || []).find(s => s.id === sessionId);
        if (!sess) sess = await window.store.getSessionDetails(sessionId);
        if (sess) {
          const st = (sess.status || '').toUpperCase();
          if (st === 'PENDING') {
            alert('⚠️ Cannot enter live room: This session is still PENDING mentor acceptance.');
            return;
          }
          if (st === 'DECLINED') {
            alert('⚠️ Cannot enter live room: This session request was DECLINED.');
            return;
          }
          if (st === 'CANCELLED') {
            alert('⚠️ Cannot enter live room: This session was CANCELLED.');
            return;
          }
        }
      } catch (e) {
        console.warn('Session status check error:', e);
      }

      this.activeLiveRoomSessionId = sessionId;
      this.switchView('view-room');
      await this.renderLiveRoom(sessionId);
    },

    async enrollInLiveCohort(sessionId) {
      try {
        const res = await window.store.enrollInCohort(sessionId);
        this.showToast(`🎉 Registered for Masterclass! (Free Join — 0 Credits)`, 'check');
        await window.store.fetchSessions();
        await window.store.fetchWallet();
        this.renderNavbar();
        await this.renderSessions();
        await this.renderWallet();
        if (this.currentTab === 'view-room') {
          await this.renderLiveRoom(sessionId);
        }
      } catch (err) {
        alert('Registration failed: ' + err.message);
      }
    },

    async concludeCohortSession(sessionId) {
      if (!confirm(`Conclude this live masterclass and finalize attendance? Creator rewards will be calculated based on actual live session attendance percentage over registered website users.`)) {
        return;
      }

      try {
        const res = await window.store.finalizeMasterclassAttendance(sessionId);
        if (res.alreadyFinalized) {
          this.showToast(`ℹ️ Masterclass attendance already finalized. Reward: +${res.rewardCredits || 0} Credits.`, 'circle-info');
        } else {
          this.showToast(`🎉 Attendance Finalized! Actual Attendance: ${res.actualAttendees}/${res.totalUsers} (${res.attendancePercentage}%). Reward: +${res.rewardCredits} Credits deposited!`, 'award');
        }
        await window.store.init();
        this.renderAll();
        if (this.currentTab === 'view-room') {
          await this.renderLiveRoom(sessionId);
        }
      } catch (err) {
        alert('Error finalizing attendance: ' + err.message);
      }
    },

    async acceptSwapSession(sessionId) {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/accept`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${window.store.token}`
          }
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || data.message || 'Failed to accept session');
        }
        this.showToast('🎉 Swap Session Accepted! Requester notified.', 'check');
        await window.store.fetchSessions();
        await this.renderSessions();
      } catch (err) {
        alert('Error accepting session: ' + err.message);
      }
    },

    async declineSwapSession(sessionId, reason = '') {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/decline`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${window.store.token}`
          },
          body: JSON.stringify({ reason })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || data.message || 'Failed to decline session');
        }
        this.showToast('ℹ️ Swap session request declined. Escrow refunded to requester.', 'info');
        await window.store.fetchSessions();
        await window.store.fetchWallet();
        this.renderNavbar();
        await this.renderSessions();
      } catch (err) {
        alert('Error declining session: ' + err.message);
      }
    },

    openDeclineModal(sessionId, skillName = '') {
      const reason = prompt(`Decline session request for "${skillName || 'Swap Session'}"?\n\nOptional message to student:`);
      if (reason !== null) {
        this.declineSwapSession(sessionId, reason);
      }
    },

    updateBookingCalculation() {
      const hours = Number(document.getElementById('bookDurationSelect').value);
      const rate = Number(document.getElementById('bookHourlyRate').value || 1.0);
      const total = (hours * rate).toFixed(1);
      const notice = document.getElementById('bookEscrowNotice');
      if (notice) {
        notice.innerHTML = `<strong>${hours} Hours &times; ${rate} Credits/hr = ${total} Credits</strong> will be locked in escrow. Your mentor receives credits only after the session concludes.`;
      }
    },

    // ==========================================
    // Multi-Persona & Multi-Role Authentication Handlers
    // ==========================================
    bindAuthEvents() {
      const authModal = document.getElementById('authModal');
      const openAuth = (defaultTab = 'authSignInTab') => {
        this.updateAuthModalJwtInspector();
        if (defaultTab) {
          document.querySelectorAll('.auth-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.authtab === defaultTab);
          });
          document.querySelectorAll('.auth-tab-pane').forEach(p => {
            p.style.display = p.id === defaultTab ? 'block' : 'none';
            p.classList.toggle('active', p.id === defaultTab);
          });
        }
        this.openModal('authModal');
      };

      const closeAuth = () => {
        this.closeModal('authModal');
        const loginErr = document.getElementById('loginErrorMsg');
        const regErr = document.getElementById('regErrorMsg');
        if (loginErr) loginErr.style.display = 'none';
        if (regErr) regErr.style.display = 'none';
      };

      // Navbar Triggers
      document.getElementById('navAuthBtn')?.addEventListener('click', () => openAuth('authSignInTab'));

      document.getElementById('dropdownLogoutBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('personaDropdown')?.classList.remove('show');
        if (window.skillSwapConference && window.skillSwapConference.isInCall) {
          window.skillSwapConference.leaveMeeting();
        }
        window.store.logout();
        this.showToast('Signed out successfully. Switched to guest login.', 'user');
        this.renderAll();
        openAuth('authSignInTab');
      });

      document.getElementById('closeAuthModalBtn')?.addEventListener('click', closeAuth);
      document.getElementById('cancelAuthLoginBtn')?.addEventListener('click', closeAuth);
      document.getElementById('cancelAuthRegisterBtn')?.addEventListener('click', closeAuth);
      document.getElementById('closeAuthRolesBtn')?.addEventListener('click', closeAuth);

      // Single User Quick-Fill Button in Login Modal
      document.getElementById('authSingleUserQuickFillBtn')?.addEventListener('click', () => {
        const user = window.store.getCurrentPersona();
        const emailInput = document.getElementById('loginEmailInput');
        const passInput = document.getElementById('loginPasswordInput');
        if (emailInput) emailInput.value = user.email || (user.id + '@vignan.ac.in') || 'sri@vignan.ac.in';
        if (passInput) passInput.value = 'Password123';
        this.showToast(`Auto-filled verified credentials for ${user.name || 'Sri Dhanush'}`, 'user');
      });

      // Auth Tabs Navigation
      document.querySelectorAll('.auth-tab-btn').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
          document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.auth-tab-pane').forEach(p => {
            p.classList.remove('active');
            p.style.display = 'none';
          });

          tabBtn.classList.add('active');
          const targetId = tabBtn.dataset.authtab;
          const targetPane = document.getElementById(targetId);
          if (targetPane) {
            targetPane.style.display = 'block';
            targetPane.classList.add('active');
          }
          if (targetId === 'authRolesTab') {
            this.updateAuthModalJwtInspector();
          }
        });
      });

      // Role Selection Cards in Registration Form
      document.querySelectorAll('.role-card-label').forEach(card => {
        card.addEventListener('click', () => {
          document.querySelectorAll('.role-card-label').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          const radio = card.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
        });
      });

      // Login Form Submit with Email & Password Pre-Verification
      const loginForm = document.getElementById('authLoginForm');
      loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorBox = document.getElementById('loginErrorMsg');
        if (errorBox) errorBox.style.display = 'none';

        const emailOrId = document.getElementById('loginEmailInput')?.value.trim();
        const password = document.getElementById('loginPasswordInput')?.value;
        const submitBtn = document.getElementById('submitLoginBtn');
        const origText = submitBtn ? submitBtn.innerHTML : '';

        // 1. Client-Side Email Verification
        if (!emailOrId) {
          if (errorBox) {
            errorBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Email Missing:</strong> Please enter your registered email or University ID.';
            errorBox.style.display = 'block';
          }
          this.showToast('Please enter your email or University ID', 'lock');
          return;
        }

        if (emailOrId.includes('@')) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(emailOrId)) {
            if (errorBox) {
              errorBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Invalid Email Format:</strong> Please enter a valid email address (e.g., student@vignan.ac.in).';
              errorBox.style.display = 'block';
            }
            this.showToast('Invalid email format', 'lock');
            return;
          }
        }

        // 2. Client-Side Password Rule Verification (Capital start, min 6 chars)
        if (!password) {
          if (errorBox) {
            errorBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Password Missing:</strong> Please enter your password.';
            errorBox.style.display = 'block';
          }
          this.showToast('Please enter your password', 'lock');
          return;
        }

        if (!/^[A-Z]/.test(password)) {
          if (errorBox) {
            errorBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Password Rule Violation:</strong> Password must start with a Capital Letter (A-Z).';
            errorBox.style.display = 'block';
          }
          this.showToast('Password must start with Capital Letter (A-Z)', 'lock');
          return;
        }

        if (password.length < 6) {
          if (errorBox) {
            errorBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Password Too Short:</strong> Password must be at least 6 characters long.';
            errorBox.style.display = 'block';
          }
          this.showToast('Password must be at least 6 characters long', 'lock');
          return;
        }

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying Credentials & Database Token...';
          }

          const res = await window.store.login(emailOrId, password);
          closeAuth();
          await this.renderAll();
          this.showToast(`🎉 Welcome back, ${res.user?.name || 'Student'}! Logged in as ${res.user?.role || 'STUDENT'}.`, 'circle-check');
        } catch (err) {
          if (errorBox) {
            errorBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Login Failed:</strong> ${err.message}`;
            errorBox.style.display = 'block';
          }
          this.showToast(err.message, 'triangle-exclamation');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
          }
        }
      });
    },

    async renderLiveRoom(sessionId) {
      const currentPersona = window.store.getCurrentPersona();
      let session = null;
      let meetingData = null;

      const sid = sessionId || this.activeLiveRoomSessionId;
      if (sid) {
        try {
          const meetRes = await window.store.fetchLiveMeeting(sid);
          if (meetRes && meetRes.success) {
            session = meetRes.session;
            meetingData = meetRes.meeting;
            this.activeLiveRoomSessionId = session.id;
          }
        } catch (err) {
          console.warn('Live meeting API notice:', err.message);
          const sessions = window.store.sessions || await window.store.fetchSessions();
          session = sessions.find(s => s.id === sid) || sessions[0];
        }
      }

      if (!session) {
        const sessions = window.store.sessions || await window.store.fetchSessions();
        session = sessions.find(s => s.session_type === 'GROUP_COHORT' && s.status === 'Confirmed') ||
          sessions.find(s => s.session_type === 'GROUP_COHORT') ||
          sessions[0];
        if (session) this.activeLiveRoomSessionId = session.id;
      }

      if (!session) return;

      const isCohort = session.session_type === 'GROUP_COHORT';
      const isTutor = (session.teacher_id === currentPersona.id || session.teacher?.id === currentPersona.id);
      const tutorName = session.teacher?.name || session.teacherName || session.teacher_id || 'Instructor';
      const tutorId = session.teacher?.id || session.teacher_id || 'sri';
      const learnerName = session.learner?.name || session.studentName || session.student_id || 'Learner';
      const learnerId = session.learner?.id || session.student_id || 'rishitha';

      // Update Header Elements
      const typeBadge = document.getElementById('liveRoomTypeBadge');
      const attendeeCountBadge = document.getElementById('liveRoomAttendeeCountBadge');
      const titleDisplay = document.getElementById('liveRoomTitleDisplay');
      const subtitleDisplay = document.getElementById('liveRoomSubtitleDisplay');
      const stageTitle = document.getElementById('liveRoomStageTitle');
      const bountyDisplay = document.getElementById('liveRoomCohortBountyDisplay');
      const escrowCalculationText = document.getElementById('liveRoomEscrowCalculationText');
      const rosterCountEl = document.getElementById('liveRoomRosterCount');
      const attendeeListContainer = document.getElementById('liveRoomAttendeeList');
      const attendeeGridContainer = document.getElementById('liveRoomAttendeesGrid');
      const completeBtn = document.getElementById('completeSessionBtn');
      const sidebarCompleteBtn = document.getElementById('sidebarCompleteSessionBtn');
      const enrollBtn = document.getElementById('enrollLiveRoomCohortBtn');

      // Instructor Podium
      const instAvatar = document.getElementById('liveRoomInstructorAvatar');
      const instName = document.getElementById('liveRoomInstructorName');
      const instTier = document.getElementById('liveRoomInstructorTier');
      const instTag = document.getElementById('liveRoomInstructorTag');

      if (instAvatar) instAvatar.src = window.getStudentAvatar(tutorId);
      if (instName) instName.textContent = `${tutorName} (Host Tutor)`;
      if (instTier) instTier.textContent = `🥇 Verified Tutor • ${session.rate || 1.0} Cr/hr`;
      if (instTag) instTag.innerHTML = `<i class="fa-solid fa-chalkboard-user"></i> ${tutorName} (Lead Instructor)`;

      if (stageTitle) stageTitle.textContent = `LIVE SESSION: ${session.skill} • "${session.topic || 'Skill Swap Exchange'}"`;

      if (isCohort) {
        if (typeBadge) typeBadge.innerHTML = `<i class="fa-solid fa-users"></i> Live Group Masterclass`;
        if (titleDisplay) titleDisplay.textContent = `Interactive Live Classroom: ${session.skill}`;
        if (subtitleDisplay) subtitleDisplay.textContent = `Real-time multi-student cohort. Tutor earns 1 credit per attending student.`;

        let attendees = session.attendees || [];
        try {
          attendees = await window.store.fetchCohortAttendees(session.id);
        } catch (e) { }

        const countN = attendees.length;
        const feePerStudent = 1.0;
        const totalBounty = (countN * feePerStudent).toFixed(1);

        if (attendeeCountBadge) attendeeCountBadge.innerHTML = `<i class="fa-solid fa-user-check"></i> ${countN} Students Joined (N = ${countN})`;
        if (rosterCountEl) rosterCountEl.textContent = `${countN} / ${session.max_capacity || 5} Enrolled`;
        if (bountyDisplay) bountyDisplay.innerHTML = `<i class="fa-solid fa-coins"></i> Tutor Pool: +${totalBounty} Credits (${countN} Students × 1.0 Cr)`;
        if (escrowCalculationText) {
          escrowCalculationText.innerHTML = `<strong>${countN} Students × 1.0 Credit = ${totalBounty} Credits</strong> held in escrow. Released upon conclusion!`;
        }

        if (attendeeGridContainer) {
          attendeeGridContainer.innerHTML = '';
        }
      } else {
        // 1-on-1 Swap between User A and User B
        if (typeBadge) typeBadge.innerHTML = `<i class="fa-solid fa-user"></i> 1-on-1 Swap Session`;
        if (titleDisplay) titleDisplay.textContent = `1-on-1 Peer Session: ${session.skill}`;
        if (subtitleDisplay) subtitleDisplay.textContent = `Real-time interactive session between ${tutorName} and ${learnerName}.`;
        if (attendeeCountBadge) attendeeCountBadge.innerHTML = `<i class="fa-solid fa-user-check"></i> 1 Learner (${learnerName})`;
        if (bountyDisplay) bountyDisplay.innerHTML = `<i class="fa-solid fa-coins"></i> Escrow: ${session.credits} Credits`;
        if (escrowCalculationText) {
          escrowCalculationText.innerHTML = `<strong>${session.credits} Credits</strong> held in escrow. Released upon session review.`;
        }
        if (rosterCountEl) rosterCountEl.textContent = `1 Learner`;
        if (attendeeListContainer) {
          attendeeListContainer.innerHTML = `
            <div style="background: var(--bg-subtle); padding: 0.35rem 0.55rem; border-radius: var(--radius-sm); font-size: 0.76rem; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 700;">${learnerName}</span>
              <span style="color: var(--accent-emerald); font-weight: 700;">${session.credits} Cr</span>
            </div>
          `;
        }

        if (attendeeGridContainer) {
          attendeeGridContainer.innerHTML = '';
        }

        if (enrollBtn) enrollBtn.style.display = 'none';
        if (completeBtn) {
          completeBtn.style.display = 'inline-flex';
          completeBtn.innerHTML = `<i class="fa-solid fa-coins"></i> Conclude Session & Rate`;
          completeBtn.onclick = () => this.openReviewModal(session.id);
        }
        if (sidebarCompleteBtn) {
          sidebarCompleteBtn.style.display = 'inline-flex';
          sidebarCompleteBtn.innerHTML = `<i class="fa-solid fa-coins"></i> Conclude Session & Rate`;
          sidebarCompleteBtn.onclick = () => this.openReviewModal(session.id);
        }
      }

      // Start dynamic session countdown timer based on meeting_started_at and hours
      this.startSessionTimer(session);

      // Start unified live conference engine
      if (meetingData && window.skillSwapConference) {
        await window.skillSwapConference.startMeeting(session.id, session, meetingData);
      }
    },

    toggleMicrophone() {
      if (window.skillSwapConference && window.skillSwapConference.isInCall) {
        window.skillSwapConference.toggleMicrophone();
      } else {
        this.mediaState.isMicMuted = !this.mediaState.isMicMuted;
        const isMuted = this.mediaState.isMicMuted;
        const micBtn = document.getElementById('roomToggleMicBtn');
        const label = document.getElementById('roomMicBtnLabel');
        const statusText = document.getElementById('liveMicStatusText');
        const icon = micBtn?.querySelector('i');

        if (micBtn) {
          micBtn.classList.toggle('active', !isMuted);
          micBtn.classList.toggle('muted', isMuted);
        }
        if (label) label.textContent = isMuted ? 'Unmute' : 'Mute';
        if (icon) icon.className = isMuted ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone';
        if (statusText) {
          statusText.textContent = isMuted ? 'Muted' : 'Mic Live';
          statusText.style.color = isMuted ? '#f87171' : 'var(--accent-emerald)';
        }
        this.showToast(isMuted ? 'Microphone Muted' : 'Microphone Live (Unmuted)', isMuted ? 'microphone-slash' : 'microphone');
      }
    },

    toggleCamera() {
      if (window.skillSwapConference && window.skillSwapConference.isInCall) {
        window.skillSwapConference.toggleCamera();
      } else {
        this.mediaState.isCamOff = !this.mediaState.isCamOff;
        const isOff = this.mediaState.isCamOff;
        const camBtn = document.getElementById('roomToggleCamBtn');
        const label = document.getElementById('roomCamBtnLabel');
        const statusText = document.getElementById('liveCamStatusText');
        const icon = camBtn?.querySelector('i');

        if (camBtn) {
          camBtn.classList.toggle('active', !isOff);
          camBtn.classList.toggle('off', isOff);
        }
        if (label) label.textContent = isOff ? 'Start Video' : 'Stop Video';
        if (icon) icon.className = isOff ? 'fa-solid fa-video-slash' : 'fa-solid fa-video';
        if (statusText) statusText.textContent = isOff ? 'Camera Off' : 'HD 1080p Video';
        this.showToast(isOff ? 'Camera Stopped' : 'Camera Live', isOff ? 'video-slash' : 'video');
      }
    },

    toggleScreenShare() {
      if (window.skillSwapConference && window.skillSwapConference.isInCall) {
        window.skillSwapConference.toggleScreenShare();
      } else {
        this.mediaState.isScreenSharing = !this.mediaState.isScreenSharing;
        this.showToast(this.mediaState.isScreenSharing ? 'Screen sharing started' : 'Screen sharing stopped', 'desktop');
      }
    },

    openMediaSettingsModal() {
      const modal = document.getElementById('mediaSettingsModal');
      if (!modal) return;

      const audioInput = document.getElementById('audioInputSelect');
      const micVolume = document.getElementById('micVolumeSlider');
      const micVolumeDisp = document.getElementById('micVolumeValueDisplay');
      const chkNoise = document.getElementById('chkNoiseSuppression');
      const chkEcho = document.getElementById('chkEchoCancellation');
      const chkGain = document.getElementById('chkAutoGain');
      const audioOutput = document.getElementById('audioOutputSelect');
      const videoInput = document.getElementById('videoInputSelect');
      const videoRes = document.getElementById('videoResolutionSelect');
      const virtualBg = document.getElementById('virtualBgSelect');
      const chkMirror = document.getElementById('chkMirrorCamera');
      const chkLowLight = document.getElementById('chkLowLightBoost');

      if (audioInput) audioInput.value = this.mediaSettings.audioInput || 'default';
      if (micVolume) micVolume.value = this.mediaSettings.micVolume || 85;
      if (micVolumeDisp) micVolumeDisp.textContent = `${this.mediaSettings.micVolume || 85}%`;
      if (chkNoise) chkNoise.checked = this.mediaSettings.noiseSuppression !== false;
      if (chkEcho) chkEcho.checked = this.mediaSettings.echoCancellation !== false;
      if (chkGain) chkGain.checked = this.mediaSettings.autoGain !== false;
      if (audioOutput) audioOutput.value = this.mediaSettings.audioOutput || 'default';
      if (videoInput) videoInput.value = this.mediaSettings.videoInput || 'default';
      if (videoRes) videoRes.value = this.mediaSettings.resolution || '1080p';
      if (virtualBg) virtualBg.value = this.mediaSettings.virtualBg || 'none';
      if (chkMirror) chkMirror.checked = this.mediaSettings.mirrorCamera !== false;
      if (chkLowLight) chkLowLight.checked = this.mediaSettings.lowLightBoost !== false;

      const user = window.store.getCurrentPersona();
      const previewAvatar = document.getElementById('settingsPreviewAvatar');
      const previewName = document.getElementById('settingsPreviewName');
      if (previewAvatar) previewAvatar.src = window.getStudentAvatar(user.id);
      if (previewName) previewName.textContent = user.name;

      this.openModal('mediaSettingsModal');
      this.startCameraPreview();
    },

    closeMediaSettingsModal() {
      this.closeModal('mediaSettingsModal');
      this.stopCameraPreview();
    },

    async startCameraPreview() {
      const videoEl = document.getElementById('settingsVideoPreview');
      const canvasEl = document.getElementById('settingsCanvasPreview');
      const placeholder = document.getElementById('settingsVideoPlaceholder');
      const user = window.store.getCurrentPersona();

      if (placeholder) placeholder.style.display = 'none';

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          this.mediaState.previewStream = stream;
          if (videoEl) {
            videoEl.srcObject = stream;
            videoEl.style.display = 'block';
          }
          if (canvasEl) canvasEl.style.display = 'none';
          return;
        } catch (e) {
          // Camera permission denied or simulated preview
        }
      }

      // Display live animated camera preview feed instead of logo
      if (videoEl) videoEl.style.display = 'none';
      if (canvasEl) {
        canvasEl.style.display = 'block';
        this.drawProceduralVideoFeed('settingsCanvasPreview', user.name, 'PREVIEW', 0);
      }
    },

    stopCameraPreview() {
      if (this.mediaState.previewStream) {
        this.mediaState.previewStream.getTracks().forEach(t => t.stop());
        this.mediaState.previewStream = null;
      }
      if (this.videoAnimators && this.videoAnimators['settingsCanvasPreview']) {
        cancelAnimationFrame(this.videoAnimators['settingsCanvasPreview']);
        delete this.videoAnimators['settingsCanvasPreview'];
      }
      const videoEl = document.getElementById('settingsVideoPreview');
      const canvasEl = document.getElementById('settingsCanvasPreview');
      const placeholder = document.getElementById('settingsVideoPlaceholder');
      if (videoEl) {
        videoEl.srcObject = null;
        videoEl.style.display = 'none';
      }
      if (canvasEl) canvasEl.style.display = 'none';
      if (placeholder) placeholder.style.display = 'block';
    },

    saveMediaSettings() {
      const audioInput = document.getElementById('audioInputSelect')?.value || 'default';
      const micVolume = parseInt(document.getElementById('micVolumeSlider')?.value || 85);
      const chkNoise = document.getElementById('chkNoiseSuppression')?.checked !== false;
      const chkEcho = document.getElementById('chkEchoCancellation')?.checked !== false;
      const chkGain = document.getElementById('chkAutoGain')?.checked !== false;
      const audioOutput = document.getElementById('audioOutputSelect')?.value || 'default';
      const videoInput = document.getElementById('videoInputSelect')?.value || 'default';
      const resolution = document.getElementById('videoResolutionSelect')?.value || '1080p';
      const virtualBg = document.getElementById('virtualBgSelect')?.value || 'none';
      const mirrorCamera = document.getElementById('chkMirrorCamera')?.checked !== false;
      const lowLightBoost = document.getElementById('chkLowLightBoost')?.checked !== false;

      this.mediaSettings = {
        audioInput,
        micVolume,
        noiseSuppression: chkNoise,
        echoCancellation: chkEcho,
        autoGain: chkGain,
        audioOutput,
        videoInput,
        resolution,
        virtualBg,
        mirrorCamera,
        lowLightBoost
      };

      try {
        localStorage.setItem('skillswap_media_settings', JSON.stringify(this.mediaSettings));
      } catch (e) { }

      const camStatusText = document.getElementById('liveCamStatusText');
      if (camStatusText && !this.mediaState.isCamOff) {
        camStatusText.textContent = `${resolution.toUpperCase()} Video`;
      }

      this.closeMediaSettingsModal();
      this.showToast(`AV Settings Saved! (${resolution.toUpperCase()} • Noise Filter ON)`, 'check');
    },

    playSpeakerTestTone() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
          this.showToast('Audio test sound completed (AudioContext not supported)', 'volume-high');
          return;
        }
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.30); // G5

        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.6);
        this.showToast('Playing speaker test chime...', 'volume-high');
      } catch (e) {
        this.showToast('Audio test sound triggered', 'volume-high');
      }
    },

    updateVideoTileMicIndicator() {
      const isMuted = this.mediaState.isMicMuted;
      const instMic = document.querySelector('.video-box.instructor-podium .video-status-mic i');
      if (instMic) {
        instMic.className = isMuted ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone';
        instMic.parentElement.style.color = isMuted ? '#ef4444' : '#10b981';
      }

      const studentMics = document.querySelectorAll('.video-box.student-tile .video-status-mic i');
      studentMics.forEach(mic => {
        mic.className = isMuted ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone';
        mic.parentElement.style.color = isMuted ? '#ef4444' : '#10b981';
      });
    },

    updateVideoTileCameraState() {
      const isOff = this.mediaState.isCamOff;
      const podium = document.querySelector('.video-box.instructor-podium');
      if (podium) {
        podium.style.opacity = isOff ? '0.7' : '1';
      }
    },

    async renderWallet() {
      await window.store.fetchWallet();
      const user = window.store.getCurrentPersona();

      document.getElementById('walletAvailableBalance').textContent = Number(user.credits || 0).toFixed(1);
      document.getElementById('walletEscrowBalance').textContent = Number(user.escrowLocked || user.escrow_locked || 0).toFixed(1);
      document.getElementById('walletLifetimeEarned').textContent = Number(user.lifetimeEarned || user.lifetime_earned || 0).toFixed(1);
      document.getElementById('walletLifetimeSpent').textContent = Number(user.lifetimeSpent || user.lifetime_spent || 0).toFixed(1);

      const subtitleEl = document.getElementById('walletLedgerSubtitle');
      if (subtitleEl) {
        subtitleEl.textContent = `Personalized Audit Log for ${user.name} — Tiered Hourly Rates Ledger Entries`;
      }

      const tableBody = document.getElementById('walletLedgerTableBody');
      if (!tableBody) return;

      const txs = (window.store.transactions || []).filter(tx => !tx.user_id || tx.user_id === user.id);
      if (txs.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
              <i class="fa-solid fa-clock-rotate-left"></i> No transactions recorded yet for ${user.name}.
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = txs.map(tx => {
        const isPlus = tx.amount > 0;
        const statusUpper = (tx.status || 'COMPLETED').toUpperCase();
        const isHold = statusUpper === 'IN ESCROW' || statusUpper === 'LOCKED IN ESCROW';
        const impactClass = isHold ? 'hold' : isPlus ? 'plus' : 'minus';
        const impactSign = isHold ? '🔒 ' : isPlus ? '+' : '';

        return `
          <tr>
            <td>${tx.date}</td>
            <td style="font-family: monospace; font-size: 0.8rem;">${tx.id}</td>
            <td><strong>${tx.type}</strong></td>
            <td>${tx.description || tx.desc}</td>
            <td>${tx.student_name || tx.student || 'Platform'}</td>
            <td><span class="credit-change ${impactClass}">${impactSign}${Number(tx.amount).toFixed(1)} Credits</span></td>
            <td><span class="session-ticket-status ${statusUpper === 'COMPLETED' ? 'confirmed' : 'pending'}">${statusUpper}</span></td>
          </tr>
        `;
      }).join('');
    },

    // ==========================================
    // WhatsApp-Style Direct Chat Controller (Text + Voice Only)
    // ==========================================
    bindWhatsAppChatEvents() {
      // 1. Textarea auto-resize & Mic/Send dynamic toggle
      const msgInput = document.getElementById('chatMessageInput');
      const recordBtn = document.getElementById('chatRecordVoiceBtn');
      const sendBtn = document.getElementById('chatSendBtn');
      const chatForm = document.getElementById('chatForm');
      const emojiPopup = document.getElementById('chatEmojiPopup');
      const emojiBtn = document.getElementById('chatEmojiBtn');
      const searchInput = document.getElementById('chatSearchContactsInput');

      const updateComposerButtons = () => {
        if (!msgInput) return;
        const hasText = msgInput.value.trim().length > 0;
        if (recordBtn) recordBtn.style.display = hasText ? 'none' : 'flex';
        if (sendBtn) sendBtn.style.display = hasText ? 'flex' : 'none';

        // Auto-expand textarea height
        msgInput.style.height = 'auto';
        msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
      };

      msgInput?.addEventListener('input', updateComposerButtons);
      msgInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          chatForm?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      });

      // 2. Chat Form Submit (Text message only)
      chatForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = msgInput?.value?.trim();
        if (!text || !this.activeChatContact) return;

        msgInput.value = '';
        updateComposerButtons();
        if (emojiPopup) emojiPopup.style.display = 'none';

        try {
          await window.store.sendMessage(this.activeChatContact, text);
          await this.renderChat();
          await this.renderChatMessages(true);
        } catch (err) {
          console.error('Send message error:', err);
          this.showToast(err.message || 'Could not send message', 'triangle-exclamation');
        }
      });

      // 3. Emoji Picker Toggle & Selection
      emojiBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!emojiPopup) return;
        emojiPopup.style.display = emojiPopup.style.display === 'none' ? 'block' : 'none';
      });

      document.querySelectorAll('.chat-emoji-grid .emoji-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const emoji = btn.dataset.emoji || btn.textContent.trim();
          if (msgInput && emoji) {
            const start = msgInput.selectionStart || msgInput.value.length;
            const end = msgInput.selectionEnd || msgInput.value.length;
            const val = msgInput.value;
            msgInput.value = val.substring(0, start) + emoji + val.substring(end);
            msgInput.selectionStart = msgInput.selectionEnd = start + emoji.length;
            msgInput.focus();
            updateComposerButtons();
          }
        });
      });

      document.addEventListener('click', (e) => {
        if (emojiPopup && !emojiPopup.contains(e.target) && e.target !== emojiBtn && !emojiBtn?.contains(e.target)) {
          emojiPopup.style.display = 'none';
        }
      });

      // 4. Contacts Search Filter
      searchInput?.addEventListener('input', (e) => {
        this.chatSearchQuery = e.target.value.toLowerCase().trim();
        this.renderChatContacts();
      });

      // 5. Mobile Back Button
      document.getElementById('chatMobileBackBtn')?.addEventListener('click', () => {
        const chatLayout = document.querySelector('.whatsapp-chat-layout');
        if (chatLayout) chatLayout.classList.remove('show-chat-window');
      });

      // 6. Propose Swap Button in Header
      document.getElementById('chatScheduleSwapBtn')?.addEventListener('click', () => {
        const peer = window.store.personas[this.activeChatContact];
        if (peer) {
          const skill = peer.skillsOffered?.[0] || { name: 'Peer Coaching', rate: 2.5, tier: 'Elite Master' };
          this.openBookingModal(peer.id, skill.name, skill.rate || 2.5, skill.tier || 'Elite Master');
        }
      });

      // 7. Voice Recording Button Triggers
      recordBtn?.addEventListener('click', () => this.startVoiceRecording());
      document.getElementById('chatCancelVoiceBtn')?.addEventListener('click', () => this.cancelVoiceRecording());
      document.getElementById('chatStopVoiceBtn')?.addEventListener('click', () => this.stopVoiceRecording());
      document.getElementById('chatVoicePreviewPlayBtn')?.addEventListener('click', () => this.toggleVoicePreviewPlayback());
      document.getElementById('chatVoicePreviewDiscardBtn')?.addEventListener('click', () => this.discardVoicePreview());
      document.getElementById('chatSendVoiceBtn')?.addEventListener('click', () => this.sendVoicePreview());

      const previewProgress = document.getElementById('chatVoicePreviewProgress');
      previewProgress?.addEventListener('input', (e) => {
        if (this.voicePreviewAudio && this.voicePreviewDuration > 0) {
          const seekTo = (Number(e.target.value) / 100) * this.voicePreviewDuration;
          this.voicePreviewAudio.currentTime = seekTo;
        }
      });
    },

    initChatRealtimeListener() {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/webrtc-signaling`;

        const connectWs = () => {
          try {
            const ws = new WebSocket(wsUrl);
            this.chatWs = ws;

            ws.onmessage = async (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.type === 'chat-update') {
                  const current = window.store.getCurrentPersona();
                  const isForMe = !current || data.receiverId === current.id || data.senderId === current.id || data.readerId === current.id || data.peerId === current.id || data.delivererId === current.id;

                  if (isForMe) {
                    // Fetch latest conversations with accurate database unread counts and sorting
                    const serverConvs = await window.store.fetchConversations();
                    this.chatConversations = serverConvs || [];
                    this.renderChatContacts();

                    const senderId = data.senderId || data.message?.sender_id;
                    const isIncoming = current && data.receiverId === current.id;

                    // If currently on chat tab and looking at the peer
                    if (this.currentTab === 'view-chat' && this.activeChatContact) {
                      const isRelevantPeer = this.activeChatContact === senderId || 
                                             this.activeChatContact === data.receiverId || 
                                             this.activeChatContact === data.peerId || 
                                             this.activeChatContact === data.readerId || 
                                             this.activeChatContact === data.delivererId;
                      if (isRelevantPeer) {
                        await this.renderChatMessages(data.event !== 'chat_read' && data.event !== 'chat_delivered');

                        // Automatically mark as read if active receiver
                        if (isIncoming && this.activeChatContact === senderId) {
                          await window.store.markChatAsRead(senderId);
                          const updated = await window.store.fetchConversations();
                          this.chatConversations = updated || [];
                          this.renderChatContacts();
                        }
                      }
                    } else if (isIncoming) {
                      if (data.senderName && data.message?.text) {
                        this.showToast(`💬 New message from ${data.senderName}: "${data.message.text.substring(0, 30)}"`, 'message');
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn('Chat realtime message parse error:', e);
              }
            };

            ws.onclose = () => {
              setTimeout(() => {
                connectWs();
              }, 3000);
            };

            ws.onerror = () => {
              try { ws.close(); } catch (e) { }
            };
          } catch (err) {
            setTimeout(connectWs, 3000);
          }
        };

        connectWs();
      } catch (err) {
        console.warn('Real-time chat socket listener notice:', err);
      }
    },

    startDirectChat(contactId) {
      this.activeChatContact = contactId;
      this.switchView('view-chat');
      this.renderChat();
    },

    async renderChat() {
      const current = window.store.getCurrentPersona();
      try {
        const serverConvs = await window.store.fetchConversations();
        this.chatConversations = serverConvs || [];
      } catch (e) {
        this.chatConversations = [];
      }

      this.renderChatContacts();

      const peers = Object.values(window.store.personas).filter(p => p && p.id !== current?.id && !p.isAdmin && !p.is_admin);
      if (!this.activeChatContact || (!peers.some(p => p.id === this.activeChatContact) && !this.chatConversations.some(c => c.peer_id === this.activeChatContact))) {
        this.activeChatContact = this.chatConversations[0]?.peer_id || peers[0]?.id || null;
      }

      if (this.activeChatContact) {
        // Mark as read when entering active chat
        await window.store.markChatAsRead(this.activeChatContact).catch(() => { });
        const serverConvs = await window.store.fetchConversations();
        this.chatConversations = serverConvs || [];
        this.renderChatContacts();
      }

      await this.renderChatMessages(true);
      this.startChatLivePolling();
    },

    renderChatContacts() {
      const contactsList = document.getElementById('chatContactsList');
      if (!contactsList) return;

      const current = window.store.getCurrentPersona();
      const allPeers = Object.values(window.store.personas).filter(p => p && p.id !== current?.id && !p.isAdmin && !p.is_admin);

      // Start with server conversations which are already sorted by latest message created_at DESC
      const convList = (this.chatConversations || []).map(conv => ({
        peer_id: conv.peer_id || conv.peer?.id,
        name: conv.name || conv.peer?.name || conv.peer_id,
        major: conv.major || conv.peer?.major || 'Vignan Student',
        topSkill: conv.topSkill || conv.peer?.skillsOffered?.[0]?.name || 'Peer Mentor',
        rate: conv.rate || conv.peer?.skillsOffered?.[0]?.rate || 2.5,
        tier: conv.tier || conv.peer?.skillsOffered?.[0]?.tier || 'Elite Master',
        last_message: conv.last_message_preview || conv.last_message || conv.text || null,
        last_message_type: conv.last_message_type || (conv.audio_data ? 'voice' : 'text'),
        last_message_time: conv.last_message_time || conv.time || '',
        last_message_created_at: conv.last_message_created_at || conv.created_at || null,
        unread_count: Number(conv.unread_count || conv.unreadCount || 0)
      }));

      // Add any peers that don't have conversations yet
      const existingIds = new Set(convList.map(c => c.peer_id));
      allPeers.forEach(peer => {
        if (peer && peer.id && !existingIds.has(peer.id)) {
          convList.push({
            peer_id: peer.id,
            name: peer.name || peer.id,
            major: peer.major || 'Vignan Student',
            topSkill: peer.skillsOffered?.[0]?.name || 'Peer Mentor',
            rate: peer.skillsOffered?.[0]?.rate || 2.5,
            tier: peer.skillsOffered?.[0]?.tier || 'Elite Master',
            last_message: null,
            last_message_type: 'text',
            last_message_time: '',
            last_message_created_at: null,
            unread_count: 0
          });
        }
      });

      // WhatsApp Sorting:
      // 1. Conversations with recent messages sorted by created_at DESC (newest at very top)
      // 2. Remaining peers sorted alphabetically
      convList.sort((a, b) => {
        const timeA = a.last_message_created_at ? new Date(a.last_message_created_at).getTime() : 0;
        const timeB = b.last_message_created_at ? new Date(b.last_message_created_at).getTime() : 0;
        if (timeA !== timeB) {
          return timeB - timeA;
        }
        return (a.name || '').localeCompare(b.name || '');
      });

      // Update total unread badges
      const totalUnread = convList.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      const totalBadge = document.getElementById('chatTotalUnreadBadge');
      if (totalBadge) {
        totalBadge.textContent = totalUnread;
        totalBadge.style.display = totalUnread > 0 ? 'inline-block' : 'none';
      }

      const sidebarBadge = document.getElementById('sidebarChatBadge');
      if (sidebarBadge) {
        sidebarBadge.textContent = totalUnread;
        sidebarBadge.style.display = totalUnread > 0 ? 'inline-block' : 'none';
      }

      let filteredContacts = convList;
      if (this.chatSearchQuery) {
        filteredContacts = convList.filter(c =>
          (c.name || '').toLowerCase().includes(this.chatSearchQuery) ||
          (c.topSkill || '').toLowerCase().includes(this.chatSearchQuery) ||
          (c.major || '').toLowerCase().includes(this.chatSearchQuery)
        );
      }

      if (filteredContacts.length === 0) {
        contactsList.innerHTML = `
          <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
            <i class="fa-solid fa-magnifying-glass" style="margin-bottom: 0.5rem; font-size: 1.2rem; display: block;"></i>
            No conversations match "${this.escapeHtml(this.chatSearchQuery)}"
          </div>
        `;
        return;
      }

      contactsList.innerHTML = filteredContacts.map(contact => {
        const isSelected = this.activeChatContact === contact.peer_id;
        const unreadCount = Number(contact.unread_count || 0);
        const isVoice = contact.last_message_type === 'voice';

        let lastMsgSnippet = contact.last_message || `${contact.topSkill} • ${contact.rate} Cr/hr`;
        if (isVoice) {
          lastMsgSnippet = `<span style="color: #10b981; font-weight: ${unreadCount > 0 ? '700' : '600'};"><i class="fa-solid fa-microphone"></i> Voice message</span>`;
        } else if (contact.last_message) {
          lastMsgSnippet = this.escapeHtml(contact.last_message);
        }

        const nameWeight = unreadCount > 0 ? '800' : '700';
        const timeColor = unreadCount > 0 ? '#10b981' : 'var(--text-muted)';
        const previewColor = unreadCount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)';
        const previewWeight = unreadCount > 0 ? '700' : '400';

        return `
          <div class="chat-contact-item ${isSelected ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}" onclick="window.app.selectChatContact('${contact.peer_id}')" style="cursor: pointer; padding: 0.75rem 0.85rem; border-radius: var(--radius-md); margin-bottom: 0.35rem; display: flex; gap: 0.75rem; align-items: center; transition: all 0.2s ease; ${unreadCount > 0 ? 'background: rgba(16, 185, 129, 0.05);' : ''}">
            <div style="position: relative; flex-shrink: 0;">
              ${window.getUserLogoCardHtml ? window.getUserLogoCardHtml(contact.peer_id, 44) : `<img src="${window.getStudentAvatar(contact.peer_id)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;">`}
              <span class="online-indicator" style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; background: #10b981; border: 2px solid var(--bg-card); border-radius: 50%;"></span>
            </div>
            <div style="flex: 1; overflow: hidden; min-width: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem;">
                <div style="font-weight: ${nameWeight}; font-size: 0.9rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${this.escapeHtml(contact.name)}
                </div>
                <span style="font-size: 0.7rem; color: ${timeColor}; font-weight: ${unreadCount > 0 ? '800' : '600'}; white-space: nowrap; margin-left: 0.4rem;">
                  ${contact.last_message_time || 'Active'}
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                <div style="font-size: 0.78rem; color: ${previewColor}; font-weight: ${previewWeight}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">
                  ${lastMsgSnippet}
                </div>
                ${unreadCount > 0 ? `
                  <span class="chat-unread-badge" style="background: #10b981; color: #fff; font-size: 0.72rem; font-weight: 800; min-width: 20px; height: 20px; border-radius: 999px; display: flex; align-items: center; justify-content: center; padding: 0 5px; flex-shrink: 0; box-shadow: 0 2px 6px rgba(16,185,129,0.35);">
                    ${unreadCount}
                  </span>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    },

    async selectChatContact(cId) {
      this.activeChatContact = cId;
      const chatLayout = document.querySelector('.whatsapp-chat-layout');
      if (chatLayout) chatLayout.classList.add('show-chat-window');

      // 1. Mark as read on backend
      try {
        await window.store.markChatAsRead(cId);
        const serverConvs = await window.store.fetchConversations();
        this.chatConversations = serverConvs || [];
      } catch (e) { }

      // 2. Re-render contact list to immediately clear badge
      this.renderChatContacts();
      this.updateSidebarBadges();
      await this.renderChatMessages(true);
    },

    startChatLivePolling() {
      if (this.chatPollInterval) clearInterval(this.chatPollInterval);
      this.chatPollInterval = setInterval(async () => {
        if (this.currentTab === 'view-chat') {
          try {
            const serverConvs = await window.store.fetchConversations();
            this.chatConversations = serverConvs || [];
            this.renderChatContacts();
            if (this.activeChatContact) {
              await this.renderChatMessages(false);
            }
          } catch (e) { }
        }
      }, 2000);
    },

    stopChatLivePolling() {
      if (this.chatPollInterval) {
        clearInterval(this.chatPollInterval);
        this.chatPollInterval = null;
      }
    },

    async renderChatMessages(forceScrollBottom = false) {
      if (!this.activeChatContact) return;

      const peer = window.store.personas[this.activeChatContact] || {
        id: this.activeChatContact,
        name: this.activeChatContact,
        skillsOffered: [{ name: 'Peer Mentor', rate: 2.5, tier: 'Elite Master' }]
      };

      const nameEl = document.getElementById('activeChatName');
      if (nameEl) nameEl.textContent = peer.name;

      const avatarEl = document.getElementById('activeChatAvatar');
      if (avatarEl) avatarEl.src = window.getStudentAvatar(peer.id);

      const statusEl = document.getElementById('activeChatStatus');
      if (statusEl) {
        const topSkill = peer.skillsOffered?.[0] || { name: 'Peer Mentor', rate: 2.5, tier: 'Elite Master' };
        statusEl.innerHTML = `● Active Now • <strong>${this.escapeHtml(topSkill.name)}</strong> (${topSkill.rate || 2.5} Cr/hr • ${this.escapeHtml(topSkill.tier || 'Elite')})`;
      }

      const msgContainer = document.getElementById('chatMessagesContainer');
      if (!msgContainer) return;

      const rawMessages = await window.store.fetchChatMessages(this.activeChatContact);
      const seenIds = new Set();
      const messages = [];
      (rawMessages || []).forEach(m => {
        if (m && m.id && !seenIds.has(m.id)) {
          seenIds.add(m.id);
          messages.push(m);
        }
      });

      this.currentChatMessages = messages;
      const current = window.store.getCurrentPersona();

      const wasNearBottom = msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight < 90;

      const e2eHeaderHtml = `
        <div class="chat-e2e-notice">
          <i class="fa-solid fa-lock"></i>
          <span>Messages and voice notes are end-to-end encrypted. No one outside of this chat can read or listen to them.</span>
        </div>
      `;

      if (!messages || messages.length === 0) {
        msgContainer.innerHTML = e2eHeaderHtml + `
          <div style="text-align: center; padding: 2.5rem 1.5rem; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; justify-content: center; height: 75%;">
            <div style="width: 58px; height: 58px; border-radius: 50%; background: rgba(16,185,129,0.12); display: flex; align-items: center; justify-content: center; font-size: 1.6rem; color: #10b981; margin-bottom: 0.85rem;">
              <i class="fa-solid fa-comments"></i>
            </div>
            <h4 style="font-weight: 800; font-size: 1.05rem; color: var(--text-primary); margin-bottom: 0.35rem;">Direct Messaging with ${this.escapeHtml(peer.name)}</h4>
            <p style="font-size: 0.82rem; max-width: 360px; line-height: 1.45; margin-bottom: 1.25rem;">
              Send instant text messages or hold the 🎙️ mic button to record voice notes in real-time.
            </p>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; max-width: 440px;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.sendQuickChatMessage('👋 Hi ${this.escapeQuotes(peer.name)}, are you available for a skill swap session?')">
                👋 "Hi ${this.escapeHtml(peer.name)}, are you free for a swap?"
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.sendQuickChatMessage('💡 I want to learn ${this.escapeQuotes(peer.skillsOffered?.[0]?.name || 'your courses')}!')">
                💡 "I want to learn ${this.escapeHtml(peer.skillsOffered?.[0]?.name || 'courses')}!"
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.sendQuickChatMessage('📅 Can we schedule a 1-on-1 session this week?')">
                📅 "Can we schedule a 1-on-1 session?"
              </button>
            </div>
          </div>
        `;
      } else {
        msgContainer.innerHTML = e2eHeaderHtml + messages.map(msg => {
          const isOut = msg.sender_id === current?.id;
          const isVoice = msg.message_type === 'voice' || Boolean(msg.audio_data);
          const duration = msg.audio_duration || 5;
          const isRead = msg.status === 'READ';
          const isDelivered = msg.status === 'DELIVERED' || isRead;
          const checkColor = isRead ? '#53bdeb' : 'var(--text-muted)';
          const checkIcon = isDelivered ? 'fa-check-double' : 'fa-check';
          const checkTitle = isRead ? 'Read' : (isDelivered ? 'Delivered' : 'Sent');

          if (isVoice) {
            const player = this.activeVoicePlayers[msg.id];
            const isPlaying = player && !player.audio.paused;
            const currentSpeed = player?.speed || 1.0;
            const curTime = player?.audio ? (player.audio.currentTime || 0) : 0;
            const dur = (player?.audio && player.audio.duration && isFinite(player.audio.duration) && player.audio.duration > 0)
              ? player.audio.duration 
              : (msg.audio_duration || duration || 1);
            const pct = dur > 0 ? Math.min(100, Math.max(0, (curTime / dur) * 100)) : 0;
            const timeText = this.formatTimeMMSS(Math.floor(curTime));

            let waveformArr = msg.audio_waveform || msg.waveform;
            if (!Array.isArray(waveformArr) || waveformArr.length === 0) {
              waveformArr = this.generateFallbackWaveform(45, msg.id || '');
            }

            const activeBarCount = Math.floor((pct / 100) * waveformArr.length);

            const barsHtml = waveformArr.map((amp, idx) => {
              const h = Math.max(4, Math.round((amp || 0.3) * 22));
              const isPlayed = idx <= activeBarCount && pct > 0;
              return `<span class="v-bar ${isPlayed ? 'played' : ''}" style="height: ${h}px;" data-bar-idx="${idx}"></span>`;
            }).join('');

            return `
              <div class="message-bubble ${isOut ? 'outgoing' : 'incoming'} voice-bubble-wrapper" id="msgBubble_${msg.id}">
                <div class="chat-voice-bubble">
                  <button type="button" class="voice-bubble-play-btn" onclick="window.app.playVoiceMessage('${msg.id}')">
                    <i class="fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}" id="voicePlayIcon_${msg.id}"></i>
                  </button>
                  <div class="voice-waveform-track-wrapper">
                    <div class="voice-waveform-container" id="waveformContainer_${msg.id}" onclick="window.app.seekVoiceWaveform('${msg.id}', event)">
                      <div class="voice-waveform-bars" id="waveformBars_${msg.id}">
                        ${barsHtml}
                      </div>
                      <div class="voice-waveform-marker" id="waveformMarker_${msg.id}" style="left: ${pct}%;"></div>
                    </div>
                    <div class="voice-time-row">
                      <span class="voice-time-label" id="voiceCurTime_${msg.id}">${timeText}</span>
                      <div style="display: flex; align-items: center; gap: 0.35rem;">
                        <button type="button" class="voice-speed-pill" onclick="window.app.toggleVoiceSpeed('${msg.id}', this)">${currentSpeed}x</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="message-time">
                  <span>${msg.time || 'Just now'}</span>
                  ${isOut ? `<span class="chat-read-receipt" style="color: ${checkColor}; margin-left: 4px; font-size: 0.72rem;" title="${checkTitle}"><i class="fa-solid ${checkIcon}"></i></span>` : ''}
                </div>
              </div>
            `;
          }

          return `
            <div class="message-bubble ${isOut ? 'outgoing' : 'incoming'}">
              <div class="message-text">${this.escapeHtml(msg.text)}</div>
              <div class="message-time">
                <span>${msg.time || 'Just now'}</span>
                ${isOut ? `<span class="chat-read-receipt" style="color: ${checkColor}; margin-left: 4px; font-size: 0.72rem;" title="${checkTitle}"><i class="fa-solid ${checkIcon}"></i></span>` : ''}
              </div>
            </div>
          `;
        }).join('');
      }

      if (forceScrollBottom || wasNearBottom) {
        msgContainer.scrollTop = msgContainer.scrollHeight;
      }
    },

    // ==========================================
    // Voice Message Recording Lifecycle (MediaRecorder)
    // ==========================================
    async startVoiceRecording() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.showToast('Audio recording is not supported in this browser.', 'triangle-exclamation');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        this.voiceMediaStream = stream;
        this.voiceAudioChunks = [];
        this.voiceRecordSeconds = 0;

        let mimeType = '';
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            mimeType = 'audio/ogg;codecs=opus';
          }
        }

        const options = mimeType ? { mimeType } : {};
        const mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.voiceAudioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blobType = mediaRecorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(this.voiceAudioChunks, { type: blobType });

          if (!blob || blob.size === 0) {
            this.showToast('Unable to record audio. Please try again.', 'triangle-exclamation');
            this.discardVoicePreview();
            return;
          }

          this.voicePreviewBlob = blob;
          this.voicePreviewDuration = Math.max(1, this.voiceRecordSeconds);

          if (this.voicePreviewObjectUrl) {
            URL.revokeObjectURL(this.voicePreviewObjectUrl);
            this.voicePreviewObjectUrl = null;
          }
          this.voicePreviewObjectUrl = URL.createObjectURL(blob);
          this.setupVoicePreviewUI();

          if (this.voiceMediaStream) {
            this.voiceMediaStream.getTracks().forEach(t => t.stop());
            this.voiceMediaStream = null;
          }
        };

        this.voiceMediaRecorder = mediaRecorder;
        mediaRecorder.start(250);

        const formEl = document.getElementById('chatForm');
        const recordingStrip = document.getElementById('chatVoiceRecordingStrip');
        const previewStrip = document.getElementById('chatVoicePreviewStrip');
        if (formEl) formEl.style.display = 'none';
        if (previewStrip) previewStrip.style.display = 'none';
        if (recordingStrip) recordingStrip.style.display = 'flex';

        const timerEl = document.getElementById('chatVoiceRecordTimer');
        if (timerEl) timerEl.textContent = '00:00';

        if (this.voiceRecordingTimer) clearInterval(this.voiceRecordingTimer);
        this.voiceRecordingTimer = setInterval(() => {
          this.voiceRecordSeconds++;
          if (timerEl) timerEl.textContent = this.formatTimeMMSS(this.voiceRecordSeconds);
          if (this.voiceRecordSeconds >= 300) {
            this.stopVoiceRecording();
          }
        }, 1000);

        this.showToast('🎙️ Recording your voice... Speak now!', 'microphone');
      } catch (err) {
        console.error('Microphone access error:', err);
        const isPermission = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
        if (isPermission) {
          this.showToast('Microphone permission is required to send voice messages.', 'microphone');
        } else {
          this.showToast('Could not open microphone: ' + (err.message || 'Device error'), 'triangle-exclamation');
        }
      }
    },

    stopVoiceRecording() {
      if (this.voiceRecordingTimer) {
        clearInterval(this.voiceRecordingTimer);
        this.voiceRecordingTimer = null;
      }

      if (this.voiceMediaRecorder && this.voiceMediaRecorder.state !== 'inactive') {
        this.voiceMediaRecorder.stop();
      }
    },

    cancelVoiceRecording() {
      this.isSyntheticRecording = false;
      if (this.voiceRecordingTimer) {
        clearInterval(this.voiceRecordingTimer);
        this.voiceRecordingTimer = null;
      }
      if (this.voiceMediaRecorder && this.voiceMediaRecorder.state !== 'inactive') {
        this.voiceMediaRecorder.stop();
      }
      if (this.voiceMediaStream) {
        this.voiceMediaStream.getTracks().forEach(t => t.stop());
        this.voiceMediaStream = null;
      }
      if (this.voicePreviewObjectUrl) {
        URL.revokeObjectURL(this.voicePreviewObjectUrl);
        this.voicePreviewObjectUrl = null;
      }
      this.voiceAudioChunks = [];
      this.voicePreviewBlob = null;
      this.voicePreviewBase64 = null;

      const formEl = document.getElementById('chatForm');
      const recordingStrip = document.getElementById('chatVoiceRecordingStrip');
      const previewStrip = document.getElementById('chatVoicePreviewStrip');
      if (recordingStrip) recordingStrip.style.display = 'none';
      if (previewStrip) previewStrip.style.display = 'none';
      if (formEl) formEl.style.display = 'flex';
      this.showToast('Voice recording cancelled', 'trash');
    },

    setupVoicePreviewUI() {
      const recordingStrip = document.getElementById('chatVoiceRecordingStrip');
      const previewStrip = document.getElementById('chatVoicePreviewStrip');
      if (recordingStrip) recordingStrip.style.display = 'none';
      if (previewStrip) previewStrip.style.display = 'flex';

      const durEl = document.getElementById('chatVoicePreviewDuration');
      const curEl = document.getElementById('chatVoicePreviewCurrent');
      const progEl = document.getElementById('chatVoicePreviewProgress');
      const playIcon = document.getElementById('chatVoicePreviewPlayIcon');

      if (durEl) durEl.textContent = this.formatTimeMMSS(this.voicePreviewDuration);
      if (curEl) curEl.textContent = '0:00';
      if (progEl) {
        progEl.value = 0;
        progEl.max = this.voicePreviewDuration;
      }
      if (playIcon) playIcon.className = 'fa-solid fa-play';

      if (this.voicePreviewAudio) {
        this.voicePreviewAudio.pause();
        this.voicePreviewAudio = null;
      }

      if (!this.voicePreviewObjectUrl) return;

      const audio = new Audio(this.voicePreviewObjectUrl);
      audio.ontimeupdate = () => {
        if (curEl) curEl.textContent = this.formatTimeMMSS(Math.floor(audio.currentTime));
        if (progEl && this.voicePreviewDuration > 0) {
          progEl.value = audio.currentTime;
        }
      };
      audio.onended = () => {
        if (playIcon) playIcon.className = 'fa-solid fa-play';
        if (progEl) progEl.value = 0;
        if (curEl) curEl.textContent = '0:00';
      };
      if (progEl) {
        progEl.oninput = (e) => {
          if (audio) audio.currentTime = Number(e.target.value);
        };
      }

      this.voicePreviewAudio = audio;
    },

    toggleVoicePreviewPlayback() {
      if (!this.voicePreviewAudio) return;
      const playIcon = document.getElementById('chatVoicePreviewPlayIcon');
      if (this.voicePreviewAudio.paused) {
        this.voicePreviewAudio.play().catch(e => console.warn('Preview play warning:', e));
        if (playIcon) playIcon.className = 'fa-solid fa-pause';
      } else {
        this.voicePreviewAudio.pause();
        if (playIcon) playIcon.className = 'fa-solid fa-play';
      }
    },

    discardVoicePreview() {
      if (this.voicePreviewAudio) {
        this.voicePreviewAudio.pause();
        this.voicePreviewAudio = null;
      }
      if (this.voicePreviewObjectUrl) {
        URL.revokeObjectURL(this.voicePreviewObjectUrl);
        this.voicePreviewObjectUrl = null;
      }
      this.voicePreviewBlob = null;
      this.voicePreviewBase64 = null;

      const formEl = document.getElementById('chatForm');
      const previewStrip = document.getElementById('chatVoicePreviewStrip');
      if (previewStrip) previewStrip.style.display = 'none';
      if (formEl) formEl.style.display = 'flex';
      this.showToast('Voice preview discarded', 'trash');
    },

    async extractWaveformFromBlob(blob, numBars = 45) {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return this.generateFallbackWaveform(numBars);

        const audioCtx = new AudioContextClass();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0);
        const totalSamples = rawData.length;
        const blockSize = Math.floor(totalSamples / numBars) || 1;
        const rawBars = [];

        for (let i = 0; i < numBars; i++) {
          const start = i * blockSize;
          let sum = 0;
          let count = 0;
          for (let j = 0; j < blockSize && (start + j) < totalSamples; j++) {
            const val = rawData[start + j];
            sum += val * val;
            count++;
          }
          const rms = count > 0 ? Math.sqrt(sum / count) : 0;
          rawBars.push(rms);
        }

        const maxRms = Math.max(...rawBars) || 1;
        const normalized = rawBars.map(val => {
          const norm = maxRms > 0 ? (val / maxRms) : 0.2;
          return Number(Math.max(0.18, Math.min(1.0, norm)).toFixed(2));
        });

        try { audioCtx.close(); } catch (e) {}
        return normalized;
      } catch (err) {
        console.warn('AudioContext decode waveform notice:', err);
        return this.generateFallbackWaveform(numBars);
      }
    },

    generateFallbackWaveform(numBars = 45, seedStr = '') {
      const bars = [];
      let seed = 0;
      for (let i = 0; i < seedStr.length; i++) {
        seed = (seed << 5) - seed + seedStr.charCodeAt(i);
        seed |= 0;
      }
      for (let i = 0; i < numBars; i++) {
        const pseudo = Math.abs(Math.sin((i + 1) * 0.45 + seed) * Math.cos((i + 1) * 0.28));
        const norm = Math.max(0.18, Math.min(1.0, 0.2 + pseudo * 0.8));
        bars.push(Number(norm.toFixed(2)));
      }
      return bars;
    },

    async sendVoicePreview() {
      if (!this.voicePreviewBlob || !this.activeChatContact) return;

      const sendBtn = document.getElementById('chatSendVoiceBtn');
      const origHtml = sendBtn ? sendBtn.innerHTML : '';
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
      }

      try {
        if (this.voicePreviewAudio) {
          this.voicePreviewAudio.pause();
          this.voicePreviewAudio = null;
        }

        let waveform = null;
        try {
          waveform = await this.extractWaveformFromBlob(this.voicePreviewBlob, 45);
        } catch (e) {
          waveform = this.generateFallbackWaveform(45);
        }

        // 1. Upload binary audio Blob to persistent storage
        const uploadRes = await window.store.uploadVoiceAudio(this.voicePreviewBlob, this.voicePreviewDuration);
        const persistentUrl = uploadRes.audioUrl;

        // 2. Send chat message referencing persistent audio URL + decoded waveform
        await window.store.sendVoiceMessage(this.activeChatContact, persistentUrl, this.voicePreviewDuration, waveform);

        if (this.voicePreviewObjectUrl) {
          URL.revokeObjectURL(this.voicePreviewObjectUrl);
          this.voicePreviewObjectUrl = null;
        }
        this.voicePreviewBlob = null;
        this.voicePreviewDuration = 0;

        const formEl = document.getElementById('chatForm');
        const previewStrip = document.getElementById('chatVoicePreviewStrip');
        if (previewStrip) previewStrip.style.display = 'none';
        if (formEl) formEl.style.display = 'flex';

        await this.renderChat();
        await this.renderChatMessages(true);
        this.showToast('🎤 Voice message sent!', 'check');
      } catch (err) {
        console.error('Error sending voice message:', err);
        this.showToast(err.message || 'Could not send voice message', 'triangle-exclamation');
      } finally {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.innerHTML = origHtml;
        }
      }
    },

    // ==========================================
    // Voice Bubble Audio Player Controller
    // ==========================================
    playVoiceMessage(msgId, fallbackAudioSrc, durationSec) {
      if (this.voicePreviewAudio && !this.voicePreviewAudio.paused) {
        this.voicePreviewAudio.pause();
        const prevIcon = document.getElementById('chatVoicePreviewPlayIcon');
        if (prevIcon) prevIcon.className = 'fa-solid fa-play';
      }

      const updateProgressUI = (playerObj) => {
        if (!playerObj || !playerObj.audio) return;
        const audio = playerObj.audio;
        const playIcon = document.getElementById(`voicePlayIcon_${msgId}`);
        const marker = document.getElementById(`waveformMarker_${msgId}`);
        const barsContainer = document.getElementById(`waveformBars_${msgId}`);
        const curTimeDisplay = document.getElementById(`voiceCurTime_${msgId}`);

        const dur = (audio.duration && isFinite(audio.duration) && audio.duration > 0) ? audio.duration : playerObj.duration;
        const cur = audio.currentTime || 0;
        const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;

        if (marker) {
          marker.style.left = `${pct}%`;
        }
        if (barsContainer) {
          const bars = barsContainer.children;
          const activeCount = Math.floor((pct / 100) * bars.length);
          for (let i = 0; i < bars.length; i++) {
            if (i <= activeCount && pct > 0) {
              bars[i].classList.add('played');
            } else {
              bars[i].classList.remove('played');
            }
          }
        }
        if (curTimeDisplay) {
          curTimeDisplay.textContent = this.formatTimeMMSS(Math.floor(cur));
        }
        if (playIcon) {
          playIcon.className = audio.paused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
        }
      };

      const existing = this.activeVoicePlayers[msgId];
      if (existing) {
        if (existing.audio.paused) {
          Object.keys(this.activeVoicePlayers).forEach(id => {
            if (id !== msgId && !this.activeVoicePlayers[id].audio.paused) {
              this.activeVoicePlayers[id].audio.pause();
              const otherIcon = document.getElementById(`voicePlayIcon_${id}`);
              if (otherIcon) otherIcon.className = 'fa-solid fa-play';
            }
          });

          if (existing.audio.ended || existing.audio.currentTime >= existing.duration) {
            existing.audio.currentTime = 0;
          }

          existing.audio.play().catch(e => console.warn('Audio play error:', e));
        } else {
          existing.audio.pause();
        }
        updateProgressUI(existing);
        return;
      }

      const msg = (this.currentChatMessages || []).find(m => m.id === msgId);
      let audioSrc = msg?.audio_url || msg?.audio_data || fallbackAudioSrc;
      if (!audioSrc || typeof audioSrc !== 'string' || audioSrc.trim() === '') {
        this.showToast('Voice message unavailable', 'triangle-exclamation');
        return;
      }

      if (audioSrc.startsWith('/')) {
        audioSrc = window.location.origin + audioSrc;
      }

      Object.keys(this.activeVoicePlayers).forEach(id => {
        if (!this.activeVoicePlayers[id].audio.paused) {
          this.activeVoicePlayers[id].audio.pause();
          const otherIcon = document.getElementById(`voicePlayIcon_${id}`);
          if (otherIcon) otherIcon.className = 'fa-solid fa-play';
        }
      });

      const audio = new Audio(audioSrc);
      audio.preload = 'auto';
      audio.volume = 1.0;
      audio.muted = false;

      const totalDuration = msg?.audio_duration || durationSec || 1;

      const playerObj = {
        audio,
        speed: 1.0,
        duration: totalDuration
      };
      this.activeVoicePlayers[msgId] = playerObj;

      audio.onloadedmetadata = () => {
        if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          playerObj.duration = audio.duration;
        }
        updateProgressUI(playerObj);
      };

      audio.ontimeupdate = () => {
        updateProgressUI(playerObj);
      };

      audio.onplay = () => {
        updateProgressUI(playerObj);
      };

      audio.onpause = () => {
        updateProgressUI(playerObj);
      };

      audio.onended = () => {
        const playIcon = document.getElementById(`voicePlayIcon_${msgId}`);
        const marker = document.getElementById(`waveformMarker_${msgId}`);
        const barsContainer = document.getElementById(`waveformBars_${msgId}`);
        const curTimeDisplay = document.getElementById(`voiceCurTime_${msgId}`);
        const dur = playerObj.duration;

        if (playIcon) playIcon.className = 'fa-solid fa-play';
        if (marker) marker.style.left = '100%';
        if (barsContainer) {
          const bars = barsContainer.children;
          for (let i = 0; i < bars.length; i++) {
            bars[i].classList.add('played');
          }
        }
        if (curTimeDisplay) {
          curTimeDisplay.textContent = this.formatTimeMMSS(Math.floor(dur));
        }
      };

      audio.onerror = (e) => {
        console.error('Audio playback error for msg:', msgId, e);
        const playIcon = document.getElementById(`voicePlayIcon_${msgId}`);
        if (playIcon) playIcon.className = 'fa-solid fa-play';
        this.showToast('Audio playback error', 'triangle-exclamation');
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            updateProgressUI(playerObj);
          })
          .catch(e => {
            console.warn('Audio playback start notice:', e.message || e);
            updateProgressUI(playerObj);
            const isAbort = e.name === 'AbortError' || (e.message && e.message.includes('interrupted'));
            if (!isAbort) {
              this.showToast('Could not play audio: ' + (e.message || 'Playback blocked'), 'triangle-exclamation');
            }
          });
      }
    },

    seekVoiceWaveform(msgId, event) {
      const container = document.getElementById(`waveformContainer_${msgId}`) || event.currentTarget;
      const player = this.activeVoicePlayers[msgId];
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickPct = Math.max(0, Math.min(1, clickX / rect.width));

      if (player && player.audio) {
        const dur = (player.audio.duration && isFinite(player.audio.duration) && player.audio.duration > 0) ? player.audio.duration : player.duration;
        const seekTime = clickPct * dur;
        player.audio.currentTime = seekTime;

        const marker = document.getElementById(`waveformMarker_${msgId}`);
        const barsContainer = document.getElementById(`waveformBars_${msgId}`);
        const curTimeDisplay = document.getElementById(`voiceCurTime_${msgId}`);

        if (marker) marker.style.left = `${clickPct * 100}%`;
        if (barsContainer) {
          const bars = barsContainer.children;
          const activeCount = Math.floor(clickPct * bars.length);
          for (let i = 0; i < bars.length; i++) {
            if (i <= activeCount && clickPct > 0) {
              bars[i].classList.add('played');
            } else {
              bars[i].classList.remove('played');
            }
          }
        }
        if (curTimeDisplay) {
          curTimeDisplay.textContent = this.formatTimeMMSS(Math.floor(seekTime));
        }
      }
    },

    toggleVoiceSpeed(msgId, btnEl) {
      const player = this.activeVoicePlayers[msgId];
      if (!player) return;

      const speeds = [1.0, 1.5, 2.0];
      const nextIdx = (speeds.indexOf(player.speed) + 1) % speeds.length;
      player.speed = speeds[nextIdx];
      player.audio.playbackRate = player.speed;

      if (btnEl) {
        btnEl.textContent = `${player.speed}x`;
      }
    },

    formatTimeMMSS(sec) {
      const s = Math.max(0, Math.floor(sec || 0));
      const mins = Math.floor(s / 60);
      const secs = s % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    },

    async sendQuickChatMessage(quickText) {
      if (!quickText || !this.activeChatContact) return;
      try {
        await window.store.sendMessage(this.activeChatContact, quickText);
        await this.renderChat();
        await this.renderChatMessages(true);
      } catch (err) {
        console.error('Quick message send error:', err);
        this.showToast(err.message || 'Could not send message', 'triangle-exclamation');
      }
    },

    async renderProfile() {
      if (window.store?.fetchCertificates) {
        await window.store.fetchCertificates();
      }
      const user = window.store.getCurrentPersona();
      document.getElementById('profileCardName').textContent = user.name;
      document.getElementById('profileCardMajor').textContent = user.major;
      document.getElementById('profileCardBio').textContent = user.bio;
      document.getElementById('profileCardAvatar').src = window.getStudentAvatar(user.id);

      // Database Storage & Record Metadata Strip
      const dbStatusEl = document.getElementById('profileCardDbStatus');
      if (dbStatusEl) dbStatusEl.textContent = 'SQLite / Supabase Synced (Active)';
      const userIdEl = document.getElementById('profileCardUserId');
      if (userIdEl) userIdEl.textContent = user.id || 'sri';
      const loginCountEl = document.getElementById('profileCardLoginCount');
      if (loginCountEl) {
        const cnt = user.login_count || user.loginCount || 1;
        loginCountEl.textContent = `${cnt} ${cnt === 1 ? 'Login' : 'Logins'}`;
      }
      const lastLoginEl = document.getElementById('profileCardLastLogin');
      if (lastLoginEl) {
        if (user.last_login_at || user.lastLoginAt) {
          const dateStr = user.last_login_at || user.lastLoginAt;
          lastLoginEl.textContent = new Date(dateStr).toLocaleString();
        } else {
          lastLoginEl.textContent = 'Active Session';
        }
      }
      const rolePillEl = document.getElementById('profileCardRolePill');
      if (rolePillEl) {
        const r = user.role || (user.isAdmin ? 'ADMIN' : 'STUDENT');
        rolePillEl.textContent = r;
        const rClass = (r === 'ADMIN' || r === 'FACULTY_ADMIN' || r === 'SUPER_ADMIN') ? 'role-admin' : 'role-student';
        rolePillEl.className = `auth-role-pill ${rClass}`;
      }

      const badgesContainer = document.getElementById('profileBadgeContainer');
      if (badgesContainer) {
        const role = window.store.getUserRole();
        const roleClass = (role === 'ADMIN' || role === 'FACULTY_ADMIN' || role === 'SUPER_ADMIN') ? 'role-admin' : 'role-student';

        const cfg = window.USER_LOGO_CONFIGS?.[user.id?.toLowerCase()] || {};
        const roleBadgeHtml = `<span class="auth-role-pill ${roleClass}" style="margin-right: 0.35rem;"><i class="fa-solid fa-shield-halved"></i> ${role}</span>`;
        const specialtyBadgeHtml = cfg.badgeText ? `<span class="student-badge" style="background: rgba(99,102,241,0.15); color: var(--primary); font-weight: 700; margin-right: 0.35rem;"><i class="fa-solid fa-gem"></i> ${cfg.badgeIcon || '⚡'} ${cfg.badgeText}</span>` : '';
        const emailBadgeHtml = user.email ? `<span class="student-badge" style="margin-right: 0.35rem;"><i class="fa-regular fa-envelope"></i> ${user.email}</span>` : '';

        badgesContainer.innerHTML = roleBadgeHtml + specialtyBadgeHtml + emailBadgeHtml + (user.badges || []).map(b => `
          <span class="student-badge"><i class="fa-solid fa-medal" style="color: #f59e0b;"></i> ${b}</span>
        `).join('');
      }

      // Update Top-Tier Badge in Header dynamically based on Quiz Scores + Verified Certificates
      const topTierBadgeEl = document.getElementById('profileCardTopTierBadge');
      if (topTierBadgeEl) {
        const certs = user.certificates || [];
        const hasVerifiedCert = certs.some(c => (c.is_verified === 1 || (c.certificate_status || '').toUpperCase() === 'VERIFIED'));
        const skills = user.skillsOffered || [];
        const maxScore = Math.max(0, ...(skills.map(s => Number(s.quiz_score) || 0)));

        if (hasVerifiedCert && maxScore >= 90) {
          topTierBadgeEl.style.display = 'inline-flex';
          topTierBadgeEl.style.background = 'rgba(245, 158, 11, 0.15)';
          topTierBadgeEl.style.color = '#b45309';
          topTierBadgeEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          topTierBadgeEl.innerHTML = '<i class="fa-solid fa-medal"></i> 🥇 Elite Master Tutor';
        } else if (hasVerifiedCert && maxScore >= 70) {
          topTierBadgeEl.style.display = 'inline-flex';
          topTierBadgeEl.style.background = 'rgba(14, 165, 233, 0.15)';
          topTierBadgeEl.style.color = '#0369a1';
          topTierBadgeEl.style.borderColor = 'rgba(14, 165, 233, 0.4)';
          topTierBadgeEl.innerHTML = '<i class="fa-solid fa-award"></i> 🎖️ Advanced Tutor';
        } else if (maxScore >= 90) {
          topTierBadgeEl.style.display = 'inline-flex';
          topTierBadgeEl.style.background = 'rgba(148, 163, 184, 0.2)';
          topTierBadgeEl.style.color = '#334155';
          topTierBadgeEl.style.borderColor = '#94a3b8';
          topTierBadgeEl.innerHTML = '<i class="fa-solid fa-medal"></i> 🥈 Silver Tutor';
        } else if (maxScore >= 70) {
          topTierBadgeEl.style.display = 'inline-flex';
          topTierBadgeEl.style.background = 'rgba(205, 127, 50, 0.15)';
          topTierBadgeEl.style.color = '#854d0e';
          topTierBadgeEl.style.borderColor = 'rgba(205, 127, 50, 0.4)';
          topTierBadgeEl.innerHTML = '<i class="fa-solid fa-medal"></i> 🥉 Bronze Tutor';
        } else if (hasVerifiedCert) {
          topTierBadgeEl.style.display = 'inline-flex';
          topTierBadgeEl.style.background = 'rgba(16, 185, 129, 0.15)';
          topTierBadgeEl.style.color = '#047857';
          topTierBadgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          topTierBadgeEl.innerHTML = '<i class="fa-solid fa-certificate"></i> Verified Academic Scholar';
        } else {
          topTierBadgeEl.style.display = 'inline-flex';
          topTierBadgeEl.style.background = 'rgba(100, 116, 139, 0.12)';
          topTierBadgeEl.style.color = '#475569';
          topTierBadgeEl.style.borderColor = 'rgba(100, 116, 139, 0.25)';
          topTierBadgeEl.innerHTML = '<i class="fa-solid fa-user-graduate"></i> Student Peer Learner';
        }
      }

      // Render Verified Certificates Showcase
      const certsGrid = document.getElementById('profileCertificatesGrid');
      if (certsGrid) {
        const certs = user.certificates || [];
        if (certs.length === 0) {
          certsGrid.innerHTML = `
            <div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.88rem; padding: 1rem; background: var(--bg-subtle); border-radius: var(--radius-md);">
              No external certificates linked yet. Link your NPTEL or other recognized platform certificate to unlock Advanced (2.0 Cr) or Elite Master (2.5 Cr/hr) Tutor Tiers!
            </div>
          `;
        } else {
          certsGrid.innerHTML = certs.map(c => {
            const authLower = (c.authority || c.issuer || c.platform || '').toLowerCase();
            let issuerLogoSvg = window.ISSUER_LOGOS?.vignan || '';
            if (authLower.includes('nptel')) issuerLogoSvg = window.ISSUER_LOGOS?.nptel || '';
            else if (authLower.includes('aws')) issuerLogoSvg = window.ISSUER_LOGOS?.aws || '';
            else if (authLower.includes('google')) issuerLogoSvg = window.ISSUER_LOGOS?.google || '';
            else if (authLower.includes('microsoft')) issuerLogoSvg = window.ISSUER_LOGOS?.microsoft || '';

            const rawStatus = (c.certificate_status || c.verification_status || c.status || '').toUpperCase();
            let status = 'PENDING_VERIFICATION';
            if (rawStatus === 'VERIFIED' || c.is_verified === 1) {
              status = 'VERIFIED';
            } else if (rawStatus === 'NOT_VERIFIED' || c.verification_result === 'FAKE' || c.is_verified === -1) {
              status = 'NOT_VERIFIED';
            } else if (rawStatus === 'NEEDS_MANUAL_REVIEW' || rawStatus === 'NEEDS_REVIEW' || rawStatus === 'PENDING_FACULTY') {
              status = 'NEEDS_MANUAL_REVIEW';
            } else if (c.is_verified === 0 && (c.verification_reason || c.rejection_reason)) {
              status = 'NOT_VERIFIED';
            }

            const isVerified = status === 'VERIFIED';
            const isNotVerified = status === 'NOT_VERIFIED';
            const isManualReview = status === 'NEEDS_MANUAL_REVIEW';

            let statusBadgeHtml = '';
            let eligibilityHtml = '';
            let alertNoticeHtml = '';
            let cardBgStyle = '';

            if (isVerified) {
              cardBgStyle = 'background: #f0fdf4; border: 1.5px solid #bbf7d0;';
              statusBadgeHtml = `<span style="font-size: 0.75rem; font-weight: 800; color: #15803d; background: #dcfce7; padding: 0.25rem 0.65rem; border-radius: var(--radius-full); border: 1px solid #86efac; display: inline-flex; align-items: center; gap: 0.3rem;"><i class="fa-solid fa-circle-check"></i> VERIFIED</span>`;
              eligibilityHtml = `<div style="font-size: 0.78rem; color: #16a34a; font-weight: 700; margin-top: 0.25rem;"><i class="fa-solid fa-check"></i> Eligible to teach</div>`;
              alertNoticeHtml = `<div style="margin-top: 0.75rem; padding: 0.65rem 0.85rem; background: rgba(22, 163, 74, 0.08); border: 1px solid rgba(22, 163, 74, 0.25); border-radius: var(--radius-md); font-size: 0.75rem; color: #15803d; display: flex; align-items: flex-start; gap: 0.45rem; line-height: 1.45;"><i class="fa-regular fa-circle-check" style="margin-top: 2px; flex-shrink: 0;"></i> <div><strong>Verification Passed:</strong> Certificate is authentic. Tutor Tier upgraded &amp; Book Swap Mentor Access unlocked. (+2.0 Skill Credits awarded)</div></div>`;
            } else if (isNotVerified) {
              cardBgStyle = 'background: #fef2f2; border: 1.5px solid #fecaca;';
              statusBadgeHtml = `<span style="font-size: 0.75rem; font-weight: 800; color: #b91c1c; background: #fee2e2; padding: 0.25rem 0.65rem; border-radius: var(--radius-full); border: 1px solid #fca5a5; display: inline-flex; align-items: center; gap: 0.3rem;"><i class="fa-solid fa-circle-xmark"></i> NOT VERIFIED</span>`;
              eligibilityHtml = `<div style="font-size: 0.78rem; color: #dc2626; font-weight: 700; margin-top: 0.25rem;"><i class="fa-solid fa-xmark"></i> Not eligible to teach</div>`;
              const reasonText = c.verification_reason || 'Certificate could not be authenticated through official issuer registry. Tutor access denied.';
              alertNoticeHtml = `<div style="margin-top: 0.75rem; padding: 0.65rem 0.85rem; background: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.25); border-radius: var(--radius-md); font-size: 0.75rem; color: #b91c1c; display: flex; align-items: flex-start; gap: 0.45rem; line-height: 1.45;"><i class="fa-solid fa-circle-exclamation" style="margin-top: 2px; flex-shrink: 0;"></i> <div><strong>Verification Failed:</strong> ${reasonText}</div></div>`;
            } else if (isManualReview) {
              cardBgStyle = 'background: #fff7ed; border: 1.5px solid #fed7aa;';
              statusBadgeHtml = `<span style="font-size: 0.75rem; font-weight: 800; color: #c2410c; background: #ffedd5; padding: 0.25rem 0.65rem; border-radius: var(--radius-full); border: 1px solid #fdba74; display: inline-flex; align-items: center; gap: 0.3rem;"><i class="fa-solid fa-triangle-exclamation"></i> NEEDS REVIEW</span>`;
              eligibilityHtml = `<div style="font-size: 0.78rem; color: #ea580c; font-weight: 700; margin-top: 0.25rem;"><i class="fa-solid fa-clock"></i> Not eligible yet</div>`;
              alertNoticeHtml = `<div style="margin-top: 0.75rem; padding: 0.65rem 0.85rem; background: rgba(234, 88, 12, 0.08); border: 1px solid rgba(234, 88, 12, 0.25); border-radius: var(--radius-md); font-size: 0.75rem; color: #c2410c; display: flex; align-items: flex-start; gap: 0.45rem; line-height: 1.45;"><i class="fa-solid fa-clock" style="margin-top: 2px; flex-shrink: 0;"></i> <div><strong>Queued for Faculty Review:</strong> Automated checks inconclusive. Forwarded for Faculty Administrator manual audit. Tutor eligibility pending.</div></div>`;
            } else {
              cardBgStyle = 'background: #fefce8; border: 1.5px solid #fef08a;';
              statusBadgeHtml = `<span style="font-size: 0.75rem; font-weight: 800; color: #a16207; background: #fef3c7; padding: 0.25rem 0.65rem; border-radius: var(--radius-full); border: 1px solid #fde68a; display: inline-flex; align-items: center; gap: 0.3rem;"><i class="fa-regular fa-clock"></i> PENDING VERIFICATION</span>`;
              eligibilityHtml = `<div style="font-size: 0.78rem; color: #d97706; font-weight: 700; margin-top: 0.25rem;"><i class="fa-regular fa-clock"></i> Verification in progress...</div>`;
              alertNoticeHtml = `<div style="margin-top: 0.75rem; padding: 0.65rem 0.85rem; background: rgba(217, 119, 6, 0.08); border: 1px solid rgba(217, 119, 6, 0.25); border-radius: var(--radius-md); font-size: 0.75rem; color: #a16207; display: flex; align-items: flex-start; gap: 0.45rem; line-height: 1.45;"><i class="fa-regular fa-clock" style="margin-top: 2px; flex-shrink: 0;"></i> <div><strong>Verification Running:</strong> Verification starts immediately upon upload. You are not eligible to teach yet.</div></div>`;
            }

            const certTitle = c.title || c.skill_name || 'Academic Certificate';
            const certAuthority = c.authority || c.issuer || c.platform || 'NPTEL';
            const certId = c.credential_id || c.certificate_id || c.id || 'N/A';
            const certScore = c.score_or_grade || c.score || '';
            const certDuration = c.duration || '';
            const uploadDate = c.uploaded_at ? new Date(c.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : (c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '22 Sep 2026');

            return `
              <div style="${cardBgStyle} border-radius: var(--radius-xl); padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; gap: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.06); flex-shrink: 0;">
                        <i class="fa-solid fa-file-pdf" style="font-size: 1.2rem; color: #ef4444;"></i>
                      </div>
                      <div>
                        <h4 style="font-size: 0.98rem; font-weight: 800; line-height: 1.25; margin: 0; color: var(--text-primary);">${certTitle}</h4>
                        <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-top: 0.15rem;">${certAuthority}</div>
                      </div>
                    </div>
                    <button class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; display: inline-flex; align-items: center; gap: 0.35rem;" onclick="window.app.openCertificateAuditModal('${c.id || certId}')">
                      <i class="fa-solid fa-magnifying-glass"></i> View
                    </button>
                  </div>
                  
                  <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem; line-height: 1.5;">
                    <div><strong>Certificate ID:</strong> ${certId}</div>
                    ${certDuration ? `<div><strong>Duration:</strong> ${certDuration}</div>` : ''}
                    ${certScore ? `<div><strong>Score:</strong> ${certScore}</div>` : ''}
                    <div><strong>Uploaded:</strong> ${uploadDate}</div>
                  </div>

                  <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem;">
                    ${statusBadgeHtml}
                  </div>
                  ${eligibilityHtml}
                </div>
                ${alertNoticeHtml}
              </div>
            `;
          }).join('');
        }
      }

      // Render Skills Offered with 4 Exact Categories
      const offeredList = document.getElementById('profileSkillsOfferedList');
      if (offeredList) {
        offeredList.innerHTML = (user.skillsOffered || []).map(s => {
          let tierBadgeText = '🥉 1. Bronze Tutor (1.0 Cr/hr)';
          let tierBadgeStyle = 'background: rgba(205, 127, 50, 0.15); color: #854d0e;';

          if (s.tier === 'Elite Master') {
            tierBadgeText = '🥇 4. Elite Master (2.5 Cr/hr)';
            tierBadgeStyle = 'background: rgba(245, 158, 11, 0.15); color: #b45309;';
          } else if (s.tier === 'Advanced') {
            tierBadgeText = '🎖️ 3. Advanced Tutor (2.0 Cr/hr)';
            tierBadgeStyle = 'background: rgba(14, 165, 233, 0.15); color: #0284c7;';
          } else if (s.tier === 'Silver') {
            tierBadgeText = '🥈 2. Silver Tutor (1.5 Cr/hr)';
            tierBadgeStyle = 'background: rgba(148, 163, 184, 0.15); color: #475569;';
          }

          return `
            <div style="background: var(--bg-subtle); padding: 0.85rem 1rem; border-radius: var(--radius-md); border-left: 3px solid var(--primary);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                <span style="font-weight: 700; font-size: 0.92rem;">
                  ${s.is_verified ? '<i class="fa-solid fa-shield-check" style="color:var(--accent-emerald);"></i> ' : ''}${s.name}
                </span>
                <span style="${tierBadgeStyle} font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: var(--radius-full);">
                  ${tierBadgeText}
                </span>
              </div>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.4rem;">${s.description || s.desc || ''}</p>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Quiz Score: <strong>${s.quiz_score || 95}%</strong> • Certs Linked: <strong>${s.cert_count || 0}</strong></div>
            </div>
          `;
        }).join('');
      }

      const wantedList = document.getElementById('profileSkillsWantedList');
      if (wantedList) {
        wantedList.innerHTML = (user.skillsWanted || []).map(s => `
          <div style="background: var(--bg-subtle); padding: 0.85rem 1rem; border-radius: var(--radius-md); border-left: 3px solid var(--accent-amber);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
              <span style="font-weight: 700; font-size: 0.92rem;">${s.name}</span>
              <span style="background: var(--accent-amber-light); color: var(--accent-amber); font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: var(--radius-full);">${s.level}</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-secondary);">${s.goal}</p>
          </div>
        `).join('');
      }

      const reviewsContainer = document.getElementById('profileReviewsContainer');
      if (reviewsContainer) {
        const reviews = user.reviews || [];
        if (reviews.length === 0) {
          reviewsContainer.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-muted);">No student feedback reviews yet. Teach a session to earn ratings from students!</div>`;
        } else {
          reviewsContainer.innerHTML = reviews.map(r => `
            <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 1.2rem;">
              <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.65rem;">
                ${window.getUserLogoCardHtml(r.reviewer_avatar || r.reviewer_id || r.target_user_id || 'sri', 38)}
                <div>
                  <div style="font-weight: 700; font-size: 0.88rem;">${r.reviewer_name || r.reviewerName}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${r.created_at || r.date} • ${r.skill}</div>
                </div>
                <div style="margin-left: auto; color: #f59e0b; font-weight: 700; font-size: 0.85rem;">
                  ⭐ ${r.rating}.0
                </div>
              </div>
              <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 0.65rem;">"${r.comment}"</p>
              <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                ${(r.tags || []).map(t => `<span class="tag-badge" style="font-size: 0.72rem;">${t}</span>`).join('')}
              </div>
            </div>
          `).join('');
        }
      }

      // Render AI Dynamic Assessment & Skill Qualification Records (quiz_attempts table in SQLite/Supabase)
      const quizAttemptsSubtitle = document.getElementById('profileQuizAttemptsSubtitle');
      if (quizAttemptsSubtitle) {
        quizAttemptsSubtitle.textContent = `Verified Skill Evaluations & Negative Marking Test Records for ${user.name} stored in Database`;
      }

      const quizAttemptsTableBody = document.getElementById('profileQuizAttemptsTableBody');
      if (quizAttemptsTableBody) {
        let attempts = [];
        try {
          attempts = await window.store.fetchQuizAttempts(user.id);
        } catch (e) {
          attempts = user.quizAttempts || [];
        }

        if (!attempts || attempts.length === 0) {
          quizAttemptsTableBody.innerHTML = `
            <tr>
              <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
                <i class="fa-solid fa-graduation-cap"></i> No assessment records stored yet for ${user.name}. Take a 20-question AI quiz to qualify courses and upgrade tutor tier!
              </td>
            </tr>
          `;
        } else {
          quizAttemptsTableBody.innerHTML = attempts.map(att => {
            const isPass = att.passed === 1 || att.passed === true;
            const dateStr = att.attempted_at ? new Date(att.attempted_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
            const tierBadge = att.tier_awarded || (isPass ? 'Bronze' : 'Unverified');
            const marksStr = `${att.marks_obtained !== undefined ? att.marks_obtained : (att.correct_count * 3 - att.wrong_count)} / ${att.max_marks || 60}`;

            let tierHtml = `<span class="student-badge" style="background: rgba(205, 127, 50, 0.15); color: #854d0e;">🥉 ${tierBadge}</span>`;
            if (tierBadge === 'Elite Master') {
              tierHtml = `<span class="student-badge" style="background: rgba(245, 158, 11, 0.15); color: #b45309; font-weight:700;">🥇 Elite Master (2.5 Cr)</span>`;
            } else if (tierBadge === 'Advanced') {
              tierHtml = `<span class="student-badge" style="background: rgba(14, 165, 233, 0.15); color: #0284c7; font-weight:700;">🎖️ Advanced (2.0 Cr)</span>`;
            } else if (tierBadge === 'Silver') {
              tierHtml = `<span class="student-badge" style="background: rgba(148, 163, 184, 0.15); color: #475569; font-weight:700;">🥈 Silver (1.5 Cr)</span>`;
            } else if (!isPass) {
              tierHtml = `<span class="student-badge" style="background: rgba(239, 68, 68, 0.15); color: #dc2626; font-weight:700;">❌ Not Passed (<70%)</span>`;
            }

            return `
              <tr>
                <td style="font-size: 0.8rem; color: var(--text-muted);">${dateStr}</td>
                <td><strong>${att.skill_name}</strong></td>
                <td>${att.total_questions || 20} Qs</td>
                <td>
                  <span style="color: var(--accent-emerald); font-weight: 700;">+${att.correct_count * 3}</span> / 
                  <span style="color: var(--accent-rose); font-weight: 700;">-${att.wrong_count * 1}</span> / 
                  <span style="color: var(--text-muted); font-weight: 600;">${att.unattempted_count || 0} unattempted</span>
                </td>
                <td><strong>${marksStr}</strong></td>
                <td>
                  <span class="mark-badge ${isPass ? 'plus' : 'minus'}">${att.score_percent}%</span>
                </td>
                <td>${tierHtml}</td>
              </tr>
            `;
          }).join('');
        }
      }

      // Render Profile-Isolated Transaction Audit Log (Supabase PostgreSQL)
      const profileSubtitle = document.getElementById('profileLedgerSubtitle');
      if (profileSubtitle) {
        profileSubtitle.textContent = `Personalized Audit Trail for ${user.name} — Immutable Ledger in Supabase PostgreSQL`;
      }

      const profileTableBody = document.getElementById('profileLedgerTableBody');
      if (profileTableBody) {
        let userTxs = [];
        try {
          userTxs = await window.store.fetchTransactionsByUser(user.id);
        } catch (e) {
          userTxs = (user.transactions || (window.store.transactions || []).filter(tx => tx.user_id === user.id));
        }

        if (!userTxs || userTxs.length === 0) {
          profileTableBody.innerHTML = `
            <tr>
              <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
                <i class="fa-solid fa-clock-rotate-left"></i> No transaction audit entries recorded yet for ${user.name}.
              </td>
            </tr>
          `;
        } else {
          profileTableBody.innerHTML = userTxs.map(tx => {
            const isPlus = tx.amount > 0;
            const isHold = tx.status === 'In Escrow';
            const impactClass = isHold ? 'hold' : isPlus ? 'plus' : 'minus';
            const impactSign = isHold ? '🔒 ' : isPlus ? '+' : '';

            return `
              <tr>
                <td>${tx.date}</td>
                <td style="font-family: monospace; font-size: 0.8rem;">${tx.id}</td>
                <td><strong>${tx.type}</strong></td>
                <td>${tx.description || tx.desc}</td>
                <td>${tx.student_name || tx.student || 'Platform'}</td>
                <td><span class="credit-change ${impactClass}">${impactSign}${Number(tx.amount).toFixed(1)} Credits</span></td>
                <td><span class="session-ticket-status ${tx.status === 'Completed' ? 'confirmed' : 'pending'}">${tx.status}</span></td>
              </tr>
            `;
          }).join('');
        }
      }
    },

    // ==========================================
    // Support Team Desk & Triage View Logic
    // ==========================================
    formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    getFileIconInfo(filename = '', fileType = '') {
      const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
      const type = (fileType || '').toLowerCase();

      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || type.startsWith('image/')) {
        return { icon: 'fa-solid fa-image', color: '#6366f1', isImg: true, isCode: false, isPdf: false, isText: false, label: 'Image', ext: ext.toUpperCase() || 'PNG' };
      }
      if (ext === 'pdf' || type.includes('pdf')) {
        return { icon: 'fa-solid fa-file-pdf', color: '#ef4444', isImg: false, isCode: false, isPdf: true, isText: false, label: 'PDF Document', ext: 'PDF' };
      }
      if (['py', 'python'].includes(ext)) {
        return { icon: 'fa-brands fa-python', color: '#3b82f6', isImg: false, isCode: true, isPdf: false, isText: false, label: 'Python Code', ext: 'PY' };
      }
      if (['js', 'jsx', 'javascript'].includes(ext)) {
        return { icon: 'fa-brands fa-js', color: '#eab308', isImg: false, isCode: true, isPdf: false, isText: false, label: 'JavaScript Code', ext: 'JS' };
      }
      if (['ts', 'tsx', 'typescript'].includes(ext)) {
        return { icon: 'fa-solid fa-code', color: '#3b82f6', isImg: false, isCode: true, isPdf: false, isText: false, label: 'TypeScript Code', ext: 'TS' };
      }
      if (['java'].includes(ext)) {
        return { icon: 'fa-brands fa-java', color: '#f97316', isImg: false, isCode: true, isPdf: false, isText: false, label: 'Java Code', ext: 'JAVA' };
      }
      if (['c', 'cpp', 'h', 'hpp'].includes(ext)) {
        return { icon: 'fa-solid fa-file-code', color: '#64748b', isImg: false, isCode: true, isPdf: false, isText: false, label: 'C/C++ Code', ext: 'CPP' };
      }
      if (['html', 'htm'].includes(ext)) {
        return { icon: 'fa-brands fa-html5', color: '#f97316', isImg: false, isCode: true, isPdf: false, isText: false, label: 'HTML', ext: 'HTML' };
      }
      if (['css', 'scss'].includes(ext)) {
        return { icon: 'fa-brands fa-css3-alt', color: '#3b82f6', isImg: false, isCode: true, isPdf: false, isText: false, label: 'CSS', ext: 'CSS' };
      }
      if (['sql'].includes(ext)) {
        return { icon: 'fa-solid fa-database', color: '#8b5cf6', isImg: false, isCode: true, isPdf: false, isText: false, label: 'SQL Query', ext: 'SQL' };
      }
      if (['json'].includes(ext)) {
        return { icon: 'fa-solid fa-brackets-curly', color: '#10b981', isImg: false, isCode: true, isPdf: false, isText: false, label: 'JSON Data', ext: 'JSON' };
      }
      return { icon: 'fa-solid fa-file-lines', color: '#6366f1', isImg: false, isCode: false, isPdf: false, isText: true, label: 'Text File', ext: ext.toUpperCase() || 'TXT' };
    },

    renderDoubtUploadedFiles() {
      const container = document.getElementById('supportUploadedFilesContainer');
      const list = document.getElementById('supportUploadedFilesList');
      const countEl = document.getElementById('supportUploadedCount');

      if (!container || !list) return;

      const files = this.doubtAttachments || [];
      if (countEl) countEl.textContent = files.length;

      if (files.length === 0) {
        container.style.display = 'none';
        list.innerHTML = '';
        return;
      }

      container.style.display = 'block';
      list.innerHTML = files.map((att, idx) => {
        const info = this.getFileIconInfo(att.name || att.file_name, att.type || att.file_type);
        const name = this.escapeHtml(att.name || att.file_name || 'attachment');
        const sizeStr = this.formatBytes(att.size || att.file_size);
        const previewBtnLabel = info.isCode ? '<i class="fa-solid fa-code"></i> View Code' : '<i class="fa-regular fa-eye"></i> Preview';

        return `
          <div class="uploaded-file-card" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.85rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center; gap: 0.75rem; overflow: hidden; flex: 1;">
              ${info.isImg && (att.data || att.file_data) ? `
                <img src="${att.data || att.file_data}" alt="${name}" style="width: 46px; height: 46px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-medium); flex-shrink: 0;">
              ` : `
                <div style="width: 46px; height: 46px; border-radius: 6px; background: rgba(99, 102, 241, 0.1); color: ${info.color}; display: flex; align-items: center; justify-content: center; font-size: 1.35rem; flex-shrink: 0;">
                  <i class="${info.icon}"></i>
                </div>
              `}
              <div style="overflow: hidden; text-align: left; flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                  <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${name}">${name}</span>
                  <i class="fa-solid fa-circle-check" style="color: #10b981; font-size: 0.85rem;" title="File verified & ready"></i>
                </div>
                <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 0.15rem;">
                  <span style="font-weight: 700; color: var(--text-secondary);">${info.ext}</span> • ${sizeStr}
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
              <button type="button" class="btn btn-secondary btn-sm file-card-action-btn" onclick="window.app.previewLocalDoubtAttachment(${idx})" style="font-size: 0.75rem; padding: 0.3rem 0.6rem;">
                ${previewBtnLabel}
              </button>
              <button type="button" class="btn btn-secondary btn-sm file-card-action-btn" onclick="window.app.downloadLocalAttachment('doubt', ${idx})" style="font-size: 0.75rem; padding: 0.3rem 0.6rem;" title="Download File">
                <i class="fa-solid fa-download"></i> Download
              </button>
              <button type="button" class="btn btn-secondary btn-sm file-card-action-btn" onclick="window.app.removeDoubtAttachment(${idx})" style="font-size: 0.75rem; padding: 0.3rem 0.55rem; color: var(--accent-rose);" title="Remove File">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    },

    renderAnswerUploadedFiles() {
      const container = document.getElementById('resolveAnswerUploadedContainer');
      const list = document.getElementById('resolveAnswerUploadedList');
      const countEl = document.getElementById('resolveAnswerUploadedCount');

      if (!container || !list) return;

      const files = this.answerAttachments || [];
      if (countEl) countEl.textContent = files.length;

      if (files.length === 0) {
        container.style.display = 'none';
        list.innerHTML = '';
        return;
      }

      container.style.display = 'block';
      list.innerHTML = files.map((att, idx) => {
        const info = this.getFileIconInfo(att.name || att.file_name, att.type || att.file_type);
        const name = this.escapeHtml(att.name || att.file_name || 'solution_attachment');
        const sizeStr = this.formatBytes(att.size || att.file_size);
        const previewBtnLabel = info.isCode ? '<i class="fa-solid fa-code"></i> View Code' : '<i class="fa-regular fa-eye"></i> Preview';

        return `
          <div class="uploaded-file-card" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.75rem 0.9rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; align-items: center; gap: 0.65rem; overflow: hidden; flex: 1;">
              ${info.isImg && (att.data || att.file_data) ? `
                <img src="${att.data || att.file_data}" alt="${name}" style="width: 42px; height: 42px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-medium); flex-shrink: 0;">
              ` : `
                <div style="width: 42px; height: 42px; border-radius: 6px; background: rgba(16, 185, 129, 0.1); color: ${info.color}; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">
                  <i class="${info.icon}"></i>
                </div>
              `}
              <div style="overflow: hidden; text-align: left; flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.35rem;">
                  <span style="font-weight: 700; font-size: 0.83rem; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${name}">${name}</span>
                  <i class="fa-solid fa-circle-check" style="color: #10b981; font-size: 0.8rem;"></i>
                </div>
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
                  <span style="font-weight: 700; color: var(--text-secondary);">${info.ext}</span> • ${sizeStr}
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0;">
              <button type="button" class="btn btn-secondary btn-sm file-card-action-btn" onclick="window.app.previewLocalAnswerAttachment(${idx})" style="font-size: 0.72rem; padding: 0.25rem 0.55rem;">
                ${previewBtnLabel}
              </button>
              <button type="button" class="btn btn-secondary btn-sm file-card-action-btn" onclick="window.app.downloadLocalAttachment('answer', ${idx})" style="font-size: 0.72rem; padding: 0.25rem 0.55rem;" title="Download">
                <i class="fa-solid fa-download"></i>
              </button>
              <button type="button" class="btn btn-secondary btn-sm file-card-action-btn" onclick="window.app.removeAnswerAttachment(${idx})" style="font-size: 0.72rem; padding: 0.25rem 0.5rem; color: var(--accent-rose);" title="Remove">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    },

    removeDoubtAttachment(index) {
      if (this.doubtAttachments && this.doubtAttachments[index]) {
        this.doubtAttachments.splice(index, 1);
        this.renderDoubtUploadedFiles();
      }
    },

    removeAnswerAttachment(index) {
      if (this.answerAttachments && this.answerAttachments[index]) {
        this.answerAttachments.splice(index, 1);
        this.renderAnswerUploadedFiles();
      }
    },

    previewLocalDoubtAttachment(index) {
      const att = this.doubtAttachments?.[index];
      if (att) this.openFilePreview(att);
    },

    previewLocalAnswerAttachment(index) {
      const att = this.answerAttachments?.[index];
      if (att) this.openFilePreview(att);
    },

    downloadLocalAttachment(type, index) {
      const att = (type === 'doubt' ? this.doubtAttachments : this.answerAttachments)?.[index];
      if (!att) return;
      const dataUri = att.data || att.file_data;
      const filename = att.name || att.file_name || 'download';
      const a = document.createElement('a');
      a.href = dataUri;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },

    /**
     * Universal File Preview Modal (Image Lightbox, PDF Viewer, Monospace Code Viewer with Copy & Download)
     */
    openFilePreview(att) {
      if (!att) return;

      const fileName = att.file_name || att.name || 'attachment';
      const fileData = att.file_data || att.data || '';
      const fileType = att.file_type || att.type || '';
      const fileSize = att.file_size || att.size || (fileData ? fileData.length : 0);

      const info = this.getFileIconInfo(fileName, fileType);

      const iconEl = document.getElementById('previewModalFileIcon');
      if (iconEl) {
        iconEl.className = info.icon;
        iconEl.style.color = info.color;
      }

      const nameEl = document.getElementById('previewModalFileName');
      if (nameEl) nameEl.textContent = fileName;

      const metaEl = document.getElementById('previewModalFileMeta');
      if (metaEl) metaEl.textContent = `${info.label} (${info.ext}) • ${this.formatBytes(fileSize)}`;

      const copyBtn = document.getElementById('previewModalCopyCodeBtn');
      const downloadBtn = document.getElementById('previewModalDownloadBtn');
      const bodyEl = document.getElementById('previewModalBody');

      this.currentPreviewCode = null;

      if (downloadBtn) {
        downloadBtn.onclick = () => {
          if (att.id && !att.id.startsWith('local_')) {
            window.store.downloadAttachment(att.id, fileName).catch(() => {
              const a = document.createElement('a');
              a.href = fileData;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              a.remove();
            });
          } else {
            const a = document.createElement('a');
            a.href = fileData;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
          }
        };
      }

      if (info.isImg) {
        if (copyBtn) copyBtn.style.display = 'none';
        if (bodyEl) {
          bodyEl.innerHTML = `
            <div style="text-align: center; max-width: 100%; max-height: 100%;">
              <img src="${fileData}" alt="${this.escapeHtml(fileName)}" style="max-width: 100%; max-height: 60vh; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.15); object-fit: contain;">
            </div>
          `;
        }
      } else if (info.isPdf) {
        if (copyBtn) copyBtn.style.display = 'none';
        if (bodyEl) {
          bodyEl.innerHTML = `
            <div style="width: 100%; height: 500px; display: flex; flex-direction: column;">
              <object data="${fileData}" type="application/pdf" width="100%" height="100%" style="border-radius: 8px; border: 1px solid var(--border-medium);">
                <div style="text-align: center; padding: 2rem;">
                  <p>PDF preview is not supported directly in this inline browser frame.</p>
                  <a href="${fileData}" download="${this.escapeHtml(fileName)}" class="btn btn-primary btn-sm">
                    <i class="fa-solid fa-download"></i> Download ${this.escapeHtml(fileName)}
                  </a>
                </div>
              </object>
            </div>
          `;
        }
      } else {
        // Code / Text
        let textContent = fileData;
        if (fileData.startsWith('data:')) {
          try {
            const base64Str = fileData.split(',')[1];
            textContent = decodeURIComponent(escape(atob(base64Str)));
          } catch (e) {
            try {
              textContent = atob(fileData.split(',')[1]);
            } catch (err) {
              textContent = fileData;
            }
          }
        }

        this.currentPreviewCode = textContent;
        if (copyBtn) copyBtn.style.display = 'inline-flex';

        const lines = textContent.split('\n');
        const formattedCode = lines.map((line, lIdx) => {
          return `<div style="display: flex; gap: 1rem;"><span style="color: #64748b; user-select: none; width: 30px; text-align: right; flex-shrink: 0;">${lIdx + 1}</span><span style="flex: 1; white-space: pre-wrap; word-break: break-all;">${this.escapeHtml(line) || ' '}</span></div>`;
        }).join('');

        if (bodyEl) {
          bodyEl.innerHTML = `
            <div style="width: 100%; text-align: left; background: #0f172a; color: #f8fafc; border-radius: 8px; padding: 1rem; font-family: 'Fira Code', monospace, Consolas; font-size: 0.85rem; line-height: 1.5; overflow-x: auto; max-height: 60vh;">
              ${formattedCode}
            </div>
          `;
        }
      }

      this.openModal('filePreviewModal');
    },

    /**
     * View Full Doubt Modal
     */
    openViewFullDoubtModal(doubtId) {
      const doubt = (this.supportTickets || []).find(d => d.id === doubtId);
      if (!doubt) return;

      const titleEl = document.getElementById('fullDoubtModalTitle');
      if (titleEl) titleEl.textContent = doubt.title;

      const authorName = doubt.raised_by_name || doubt.student_name || 'Student';
      const categoryLabel = doubt.category || doubt.course || doubt.skill_name || 'Technical Doubt';
      const metaEl = document.getElementById('fullDoubtModalMeta');
      if (metaEl) {
        metaEl.textContent = `Asked by ${authorName} • ${categoryLabel} • Status: ${doubt.status}`;
      }

      const bodyEl = document.getElementById('fullDoubtModalBody');
      if (!bodyEl) return;

      const attachments = doubt.attachments || [];
      const answers = doubt.answers || [];
      const primaryAnswer = answers[0] || null;
      const answerAttachments = doubt.answer_attachments || primaryAnswer?.attachments || [];

      let attsHtml = '';
      if (attachments.length > 0) {
        attsHtml = `
          <div style="margin-top: 0.85rem;">
            <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary); margin-bottom: 0.4rem;">
              📎 Student Attached Files (${attachments.length})
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.5rem;">
              ${attachments.map((att, aIdx) => {
          const info = this.getFileIconInfo(att.file_name || att.name, att.file_type || att.type);
          const safeName = this.escapeHtml(att.file_name || att.name || 'attachment');
          const sizeStr = this.formatBytes(att.file_size || att.size);
          return `
                  <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.65rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.65rem;">
                    <div style="display: flex; align-items: center; gap: 0.6rem; overflow: hidden; flex: 1;">
                      <i class="${info.icon}" style="color: ${info.color}; font-size: 1.25rem; flex-shrink: 0;"></i>
                      <div style="overflow: hidden; text-align: left;">
                        <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${safeName}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted);">${info.ext} • ${sizeStr}</div>
                      </div>
                    </div>
                    <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
                      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.previewDoubtAttachmentById('${doubt.id}', ${aIdx})" style="font-size: 0.72rem; padding: 0.25rem 0.5rem;">
                        ${info.isCode ? 'View Code' : 'Preview'}
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.downloadDoubtAttachmentById('${doubt.id}', ${aIdx})" style="font-size: 0.72rem; padding: 0.25rem 0.5rem;">
                        <i class="fa-solid fa-download"></i>
                      </button>
                    </div>
                  </div>
                `;
        }).join('')}
            </div>
          </div>
        `;
      }

      let answerHtml = '';
      if (doubt.status === 'RESOLVED' && (primaryAnswer || doubt.mentor_solution)) {
        const solverName = primaryAnswer?.answered_by_name || doubt.accepted_by_name || doubt.support_mentor_name || 'Verified Mentor';
        const solutionText = primaryAnswer?.answer_text || doubt.mentor_solution || '';
        const classification = primaryAnswer?.classification || doubt.mentor_classification || 'Verified Solution';

        let ansAttsHtml = '';
        if (answerAttachments.length > 0) {
          ansAttsHtml = `
            <div style="margin-top: 0.75rem;">
              <div style="font-weight: 700; font-size: 0.82rem; color: #10b981; margin-bottom: 0.35rem;">
                📎 Solution Attached Files (${answerAttachments.length})
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.5rem;">
                ${answerAttachments.map((att, aIdx) => {
            const info = this.getFileIconInfo(att.file_name || att.name, att.file_type || att.type);
            const safeName = this.escapeHtml(att.file_name || att.name || 'solution_file');
            const sizeStr = this.formatBytes(att.file_size || att.size);
            return `
                    <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-md); padding: 0.65rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.65rem;">
                      <div style="display: flex; align-items: center; gap: 0.6rem; overflow: hidden; flex: 1;">
                        <i class="${info.icon}" style="color: ${info.color}; font-size: 1.25rem; flex-shrink: 0;"></i>
                        <div style="overflow: hidden; text-align: left;">
                          <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${safeName}</div>
                          <div style="font-size: 0.7rem; color: var(--text-muted);">${info.ext} • ${sizeStr}</div>
                        </div>
                      </div>
                      <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.previewAnswerAttachmentById('${doubt.id}', ${aIdx})" style="font-size: 0.72rem; padding: 0.25rem 0.5rem;">
                          ${info.isCode ? 'View Code' : 'Preview'}
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.downloadAnswerAttachmentById('${doubt.id}', ${aIdx})" style="font-size: 0.72rem; padding: 0.25rem 0.5rem;">
                          <i class="fa-solid fa-download"></i>
                        </button>
                      </div>
                    </div>
                  `;
          }).join('')}
              </div>
            </div>
          `;
        }

        answerHtml = `
          <div style="background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: var(--radius-md); padding: 1rem; margin-top: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-weight: 800; color: #10b981; font-size: 0.95rem;">
                <i class="fa-solid fa-graduation-cap"></i> Solution by ${this.escapeHtml(solverName)}
              </span>
              <span style="background: rgba(16, 185, 129, 0.2); color: #059669; font-weight: 800; font-size: 0.74rem; padding: 0.2rem 0.55rem; border-radius: var(--radius-sm);">
                ${this.escapeHtml(classification)}
              </span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap;">
              ${this.escapeHtml(solutionText)}
            </div>
            ${ansAttsHtml}

            <!-- Modal Rating Box -->
            <div style="margin-top: 0.75rem; padding-top: 0.65rem; border-top: 1px dashed rgba(16, 185, 129, 0.3); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
              <div>
                <div style="font-size: 0.84rem; font-weight: 800; color: var(--text-primary);">
                  ${doubt.rating > 0 ? `✓ Student Rating: ${doubt.rating} / 5 Stars (Locked)` : 'Rate Mentor\'s Solution:'}
                </div>
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
                  ${doubt.rating > 0 ? (doubt.rating >= 3 ? `🎉 +${doubt.reward_credits || 0.5} Cr bounty credited to mentor!` : `⭐ Rating recorded (${doubt.rating} Stars).`) : '3★ or higher releases mentor credit reward.'}
                </div>
              </div>
              ${doubt.rating > 0 ? `
                <div style="display: flex; gap: 0.25rem; align-items: center;" title="Rating Locked (${doubt.rating} Stars)">
                  ${[1, 2, 3, 4, 5].map(star => `
                    <i class="fa-${doubt.rating >= star ? 'solid' : 'regular'} fa-star" style="color: #f59e0b; font-size: 1.25rem;"></i>
                  `).join('')}
                </div>
              ` : `
                <div class="support-star-rating">
                  ${[1, 2, 3, 4, 5].map(star => `
                    <button type="button" class="star-btn" onclick="window.app.rateSupportTicket('${doubt.id}', ${star}); window.app.closeModal('viewFullDoubtModal');" title="Rate ${star} Stars">
                      <i class="fa-${(doubt.rating || 0) >= star ? 'solid' : 'regular'} fa-star" style="color: #f59e0b; font-size: 1.25rem;"></i>
                    </button>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        `;
      }

      bodyEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="font-size: 0.9rem; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap;">
            ${this.escapeHtml(doubt.description)}
          </div>

          ${doubt.code_snippet ? `
            <div style="margin-top: 0.5rem;">
              <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">Original Code Snippet:</div>
              <pre class="support-code-box" style="margin: 0; max-height: 220px; overflow-y: auto;"><code>${this.escapeHtml(doubt.code_snippet)}</code></pre>
            </div>
          ` : ''}

          ${attsHtml}
          ${answerHtml}
        </div>
      `;

      this.openModal('viewFullDoubtModal');
    },

    previewDoubtAttachmentById(doubtId, attIndex) {
      const doubt = (this.supportTickets || []).find(d => d.id === doubtId);
      const att = doubt?.attachments?.[attIndex];
      if (att) this.openFilePreview(att);
    },

    downloadDoubtAttachmentById(doubtId, attIndex) {
      const doubt = (this.supportTickets || []).find(d => d.id === doubtId);
      const att = doubt?.attachments?.[attIndex];
      if (!att) return;
      if (att.id && !att.id.startsWith('local_')) {
        window.store.downloadAttachment(att.id, att.file_name).catch(() => {
          const a = document.createElement('a');
          a.href = att.file_data;
          a.download = att.file_name;
          document.body.appendChild(a);
          a.click();
          a.remove();
        });
      } else {
        const a = document.createElement('a');
        a.href = att.file_data;
        a.download = att.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    },

    previewAnswerAttachmentById(doubtId, attIndex) {
      const doubt = (this.supportTickets || []).find(d => d.id === doubtId);
      const att = doubt?.answer_attachments?.[attIndex] || doubt?.answers?.[0]?.attachments?.[attIndex];
      if (att) this.openFilePreview(att);
    },

    downloadAnswerAttachmentById(doubtId, attIndex) {
      const doubt = (this.supportTickets || []).find(d => d.id === doubtId);
      const att = doubt?.answer_attachments?.[attIndex] || doubt?.answers?.[0]?.attachments?.[attIndex];
      if (!att) return;
      if (att.id && !att.id.startsWith('local_')) {
        window.store.downloadAttachment(att.id, att.file_name).catch(() => {
          const a = document.createElement('a');
          a.href = att.file_data;
          a.download = att.file_name;
          document.body.appendChild(a);
          a.click();
          a.remove();
        });
      } else {
        const a = document.createElement('a');
        a.href = att.file_data;
        a.download = att.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    },

    async refreshDynamicSupportSubjects() {
      try {
        const subjects = await window.store.fetchSupportSubjects();
        this.knownSupportSubjects = subjects || [];

        // 1. Populate Submit Doubt modal subject dropdown
        const skillSelect = document.getElementById('supportSkillSelect');
        if (skillSelect) {
          const currentVal = skillSelect.value;
          skillSelect.innerHTML = this.knownSupportSubjects.map(s =>
            `<option value="${this.escapeHtml(s)}">${this.escapeHtml(s)}</option>`
          ).join('') + `<option value="__custom__">➕ Other / Custom Subject...</option>`;
          if (currentVal && currentVal !== '__custom__' && this.knownSupportSubjects.includes(currentVal)) {
            skillSelect.value = currentVal;
          }
        }

        // 2. Populate Support Hub Subject Quick Filter
        const filterSelect = document.getElementById('supportSubjectFilterSelect');
        if (filterSelect) {
          const curFilter = filterSelect.value || 'ALL';
          filterSelect.innerHTML = `<option value="ALL">All Subjects (${this.knownSupportSubjects.length})</option>` +
            this.knownSupportSubjects.map(s =>
              `<option value="${this.escapeHtml(s)}">${this.escapeHtml(s)}</option>`
            ).join('');
          if (curFilter && (curFilter === 'ALL' || this.knownSupportSubjects.includes(curFilter))) {
            filterSelect.value = curFilter;
          }
        }

        // 3. Populate Search Autocomplete Suggestions Datalist
        const datalist = document.getElementById('supportSubjectDatalist');
        if (datalist) {
          datalist.innerHTML = this.knownSupportSubjects.map(s =>
            `<option value="${this.escapeHtml(s)}"></option>`
          ).join('');
        }
      } catch (e) {
        console.warn('Could not refresh dynamic subjects:', e);
      }
    },

    async openCreateSupportModal() {
      document.getElementById('createSupportTicketForm')?.reset();
      const customGroup = document.getElementById('supportCustomSubjectGroup');
      if (customGroup) customGroup.style.display = 'none';
      const customInput = document.getElementById('supportCustomSkillInput');
      if (customInput) customInput.value = '';

      this.doubtAttachments = [];
      this.renderDoubtUploadedFiles();
      const descCount = document.getElementById('doubtDescCharCount');
      if (descCount) descCount.textContent = '0';

      await this.refreshDynamicSupportSubjects();
      this.openModal('createSupportTicketModal');
      await this.checkSupportEligibilityLive();
    },

    async checkSupportEligibilityLive() {
      const skillSelect = document.getElementById('supportSkillSelect');
      const statusBox = document.getElementById('supportEligibilityStatusBox');
      if (!skillSelect || !statusBox) return;

      let skillName = skillSelect.value;
      if (skillName === '__custom__') {
        skillName = document.getElementById('supportCustomSkillInput')?.value || 'Custom Course';
      }

      statusBox.className = 'eligibility-status-box';
      statusBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying student course attendance & credentials...';

      try {
        const data = await window.store.checkSupportEligibility(skillName);
        if (data.eligible) {
          statusBox.className = 'eligibility-status-box verified';
          statusBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>✓ Eligible for 0 Cr Support:</strong> ${data.proof}`;
        } else {
          statusBox.className = 'eligibility-status-box warning';
          statusBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Prior Knowledge Notice:</strong> ${data.proof || 'No session attendance recorded in this skill yet. You can still submit if you studied independently.'}`;
        }
      } catch (err) {
        statusBox.className = 'eligibility-status-box verified';
        statusBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>✓ Eligible:</strong> Academic support pool active.`;
      }
    },

    openResolveSupportModal(ticketId) {
      const ticket = (this.supportTickets || []).find(t => t.id === ticketId);
      if (!ticket) return;

      const hiddenId = document.getElementById('resolveTicketId');
      if (hiddenId) hiddenId.value = ticket.id;

      const summary = document.getElementById('resolveTicketSummary');
      if (summary) {
        summary.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.75rem; overflow: hidden; flex: 1;">
            <div style="width: 38px; height: 38px; border-radius: 8px; background: rgba(245, 158, 11, 0.15); color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; flex-shrink: 0;">
              <i class="fa-regular fa-comment-dots"></i>
            </div>
            <div style="overflow: hidden; text-align: left; flex: 1;">
              <div style="font-weight: 800; font-size: 0.9rem; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${this.escapeHtml(ticket.title)}">${this.escapeHtml(ticket.title)}</div>
              <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 0.15rem;">
                ${this.escapeHtml(ticket.course || ticket.skill_name || 'Programming')} • ${this.escapeHtml(ticket.category || ticket.issue_type || 'Code Bug')}
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openViewFullDoubtModal('${ticket.id}')" style="font-size: 0.75rem; padding: 0.3rem 0.65rem; white-space: nowrap;">
            <i class="fa-solid fa-expand"></i> View Full Doubt
          </button>
        `;
      }

      // Pre-select recommended quiz to match skill
      const quizSelect = document.getElementById('resolveRecommendedQuizSelect');
      if (quizSelect) {
        for (let opt of quizSelect.options) {
          if (opt.value.toLowerCase().includes((ticket.skill_name || '').toLowerCase()) || (ticket.skill_name || '').toLowerCase().includes(opt.value.toLowerCase())) {
            quizSelect.value = opt.value;
            break;
          }
        }
      }

      const solutionInput = document.getElementById('resolveSolutionInput');
      if (solutionInput) solutionInput.value = '';
      const answerCount = document.getElementById('answerCharCount');
      if (answerCount) answerCount.textContent = '0';

      this.answerAttachments = [];
      this.renderAnswerUploadedFiles();

      this.openModal('resolveSupportModal');
    },

    async claimSupportTicket(ticketId) {
      try {
        await window.store.claimSupportTicket(ticketId);
        this.showToast('Ticket claimed! You can now submit your solution and earn skill credits.', 'lock');
        await this.renderSupportDesk();
      } catch (err) {
        alert('Could not claim ticket: ' + err.message);
      }
    },

    async rateSupportTicket(ticketId, rating) {
      if (!this.ratingInProgress) this.ratingInProgress = {};
      if (this.ratingInProgress[ticketId]) return;
      this.ratingInProgress[ticketId] = true;

      try {
        const res = await window.store.rateSupportTicket(ticketId, rating, '');
        if (res.rewardReleased) {
          this.showToast(`🎉 Rated ${rating} Stars! +${res.rewardAmount || 0.5} Credits reward released to mentor!`, 'coins');
        } else if (rating >= 3) {
          this.showToast(`⭐ Rated ${rating} Stars! Rating saved successfully.`, 'check');
        } else {
          this.showToast(`⭐ Rated ${rating} Stars. (Mentor reward is released for ratings of 3★ or above).`, 'user');
        }
        await window.store.fetchMe();
        await window.store.fetchWallet();
        this.renderNavbar();
        await this.renderSupportDesk(true);
        if (this.currentTab === 'view-wallet') this.renderWallet();
      } catch (err) {
        alert('Could not submit rating: ' + err.message);
      } finally {
        this.ratingInProgress[ticketId] = false;
      }
    },

    async renderSupportDesk(silent = false) {
      try {
        const [doubts, stats] = await Promise.all([
          window.store.fetchSupportDoubts(),
          window.store.fetchSupportStats(),
          this.refreshDynamicSupportSubjects()
        ]);
        this.supportTickets = doubts || [];

        // Update Dynamic KPI metrics from database
        const openEl = document.getElementById('supportOpenCount');
        if (openEl) openEl.textContent = `${stats.openDoubts || 0} Doubts`;

        const resolvedEl = document.getElementById('supportResolvedCount');
        if (resolvedEl) resolvedEl.textContent = `${stats.resolvedDoubts || 0} Solved`;

        const rewardsEl = document.getElementById('supportTotalRewards');
        if (rewardsEl) rewardsEl.textContent = `${(stats.totalRewardsCredits || 0).toFixed(1)} Cr`;

        // Update sidebar badge
        const badge = document.getElementById('sidebarSupportBadge');
        if (badge) {
          const openCount = stats.openDoubts || this.supportTickets.filter(t => t.status === 'OPEN').length;
          badge.textContent = `${openCount} Open`;
          badge.style.display = openCount > 0 ? 'inline-flex' : 'none';
        }

        this.renderSupportDeskCards();
        if (!silent) this.startSupportDeskPolling();
      } catch (err) {
        console.error('Error rendering support desk:', err);
      }
    },

    startSupportDeskPolling() {
      if (this.supportDeskPollInterval) clearInterval(this.supportDeskPollInterval);
      this.supportDeskPollInterval = setInterval(async () => {
        if (this.currentTab === 'view-support' || this.currentTab === 'view-wallet') {
          await this.renderSupportDesk(true);
          await window.store.fetchMe();
          await window.store.fetchWallet();
          this.renderNavbar();
          if (this.currentTab === 'view-wallet') this.renderWallet();
        }
      }, 5000);
    },

    async acceptSupportDoubt(doubtId, btnElement) {
      if (btnElement) {
        btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Accepting...';
        btnElement.disabled = true;
      }

      try {
        const res = await window.store.acceptSupportDoubt(doubtId);
        this.showToast('🎉 You accepted this doubt! Write your solution to earn bounty credits.', 'check');
        await this.renderSupportDesk();
        this.openResolveSupportModal(doubtId);
      } catch (err) {
        if (btnElement) {
          btnElement.innerHTML = '<i class="fa-solid fa-hand-holding-hand"></i> Accept Doubt';
          btnElement.disabled = false;
        }

        if (err.isConflict || err.status === 409 || (err.message && err.message.includes('already been accepted'))) {
          this.showToast('⚠️ This doubt has already been accepted by another user.', 'lock');
        } else {
          alert(err.message || 'Could not accept doubt.');
        }
        await this.renderSupportDesk();
      }
    },

    renderSupportDeskCards() {
      const container = document.getElementById('supportTicketsCardGrid');
      if (!container) return;

      const currentPersona = window.store.getCurrentPersona();
      const currentUserId = currentPersona?.id || window.store.currentUser?.id;
      let filtered = (this.supportTickets || []).slice();

      // 1. Filter by Status / Category / Mine
      if (this.supportFilter === 'CODE_BUG') {
        filtered = filtered.filter(t => {
          const cat = ((t.category || '') + ' ' + (t.issue_type || '')).toLowerCase();
          return cat.includes('bug') || cat.includes('error') || cat.includes('code') || cat.includes('syntax') || cat.includes('exception');
        });
      } else if (this.supportFilter === 'CONCEPT_DOUBT') {
        filtered = filtered.filter(t => {
          const cat = ((t.category || '') + ' ' + (t.issue_type || '')).toLowerCase();
          return cat.includes('concept') || cat.includes('explain') || cat.includes('theory') || cat.includes('logic') || cat.includes('why') || cat.includes('how');
        });
      } else if (this.supportFilter === 'ARCH_DESIGN') {
        filtered = filtered.filter(t => {
          const cat = ((t.category || '') + ' ' + (t.issue_type || '')).toLowerCase();
          return cat.includes('arch') || cat.includes('design') || cat.includes('db') || cat.includes('database') || cat.includes('system') || cat.includes('indexing');
        });
      } else if (this.supportFilter === 'OPEN') {
        filtered = filtered.filter(t => t.status === 'OPEN' && (!t.accepted_by_user_id || t.accepted_by_user_id === ''));
      } else if (this.supportFilter === 'ACCEPTED' || this.supportFilter === 'IN_PROGRESS') {
        filtered = filtered.filter(t => t.status === 'ACCEPTED' || t.status === 'CLAIMED');
      } else if (this.supportFilter === 'RESOLVED') {
        filtered = filtered.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED');
      } else if (this.supportFilter === 'MINE') {
        filtered = filtered.filter(t =>
          (t.raised_by_user_id && t.raised_by_user_id === currentUserId) ||
          (t.student_id && t.student_id === currentUserId) ||
          (t.accepted_by_user_id && t.accepted_by_user_id === currentUserId) ||
          (t.support_mentor_id && t.support_mentor_id === currentUserId) ||
          (t.answers && t.answers.some(a => a.answered_by_user_id === currentUserId))
        );
      }

      // 2. Filter by Dynamic Subject Filter Dropdown
      if (this.supportSubjectFilter && this.supportSubjectFilter !== 'ALL') {
        const targetSub = this.supportSubjectFilter.toLowerCase().trim();
        filtered = filtered.filter(t => {
          const combined = ((t.course || '') + ' ' + (t.skill_name || '') + ' ' + (t.category || '')).toLowerCase();
          return combined.includes(targetSub);
        });
      }

      // 3. Filter by Search Query
      if (this.supportSearchQuery) {
        const q = this.supportSearchQuery.toLowerCase().trim();
        filtered = filtered.filter(t =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.category && t.category.toLowerCase().includes(q)) ||
          (t.course && t.course.toLowerCase().includes(q)) ||
          (t.skill_name && t.skill_name.toLowerCase().includes(q)) ||
          (t.raised_by_name && t.raised_by_name.toLowerCase().includes(q)) ||
          (t.student_name && t.student_name.toLowerCase().includes(q)) ||
          (t.accepted_by_name && t.accepted_by_name.toLowerCase().includes(q))
        );
      }

      if (filtered.length === 0) {
        if (this.supportFilter === 'MINE') {
          container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px dashed var(--border-medium);">
              <i class="fa-solid fa-user-check" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 0.75rem;"></i>
              <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary);">No Personal Tasks or Doubts Found</h4>
              <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 460px; margin: 0.35rem auto 1.25rem;">
                You have not asked any doubts or accepted any peer tasks yet. Ask a doubt for free or accept an open doubt from the Common Support Hub!
              </p>
              <button class="btn btn-primary btn-sm" onclick="window.app.openCreateSupportModal()">
                <i class="fa-solid fa-plus-circle"></i> Ask a Doubt Now (0 Cr)
              </button>
            </div>
          `;
        } else if (this.supportFilter === 'OPEN') {
          container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px dashed var(--border-medium);">
              <i class="fa-solid fa-circle-check" style="font-size: 2.5rem; color: #10b981; margin-bottom: 0.75rem;"></i>
              <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary);">All Doubts Are Claimed or Solved!</h4>
              <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 440px; margin: 0.35rem auto 1.25rem;">
                There are no unassigned open doubts right now. Check back soon or raise a new question.
              </p>
              <button class="btn btn-primary btn-sm" onclick="window.app.openCreateSupportModal()">
                <i class="fa-solid fa-plus-circle"></i> Ask a Doubt (0 Cr)
              </button>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px dashed var(--border-medium);">
              <i class="fa-solid fa-headset" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 0.75rem;"></i>
              <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary);">No Support Doubts Found</h4>
              <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 440px; margin: 0.35rem auto 1.25rem;">
                ${this.supportSearchQuery ? 'No doubts match your search query.' : 'Raise a doubt or ask for help in any engineering topic (Cost: 0 Credits).'}
              </p>
              <button class="btn btn-primary btn-sm" onclick="window.app.openCreateSupportModal()">
                <i class="fa-solid fa-plus-circle"></i> Ask a Doubt Now (0 Cr)
              </button>
            </div>
          `;
        }
        return;
      }

      const escapeHtml = (str) => {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      };

      const renderAttachmentCardsList = (doubt) => {
        const atts = doubt.attachments || [];
        if (atts.length === 0 && doubt.attachment_data) {
          atts.push({
            id: 'dbt_att_' + doubt.id,
            file_name: doubt.attachment_name || 'attachment',
            file_type: doubt.attachment_data.startsWith('data:image/') ? 'image/png' : 'text/plain',
            file_data: doubt.attachment_data,
            file_size: doubt.attachment_data.length
          });
        }

        if (atts.length === 0) return '';

        return `
          <div style="margin-top: 0.5rem;">
            <div style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.35rem;">
              📎 Attachments (${atts.length}):
            </div>
            <div style="display: grid; grid-template-columns: 1fr; gap: 0.4rem;">
              ${atts.map((att, aIdx) => {
          const info = this.getFileIconInfo(att.file_name, att.file_type);
          const name = escapeHtml(att.file_name || 'attachment');
          const sizeStr = this.formatBytes(att.file_size || att.size);
          return `
                  <div style="background: var(--bg-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.45rem 0.75rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.55rem; overflow: hidden; flex: 1;">
                      <i class="${info.icon}" style="color: ${info.color}; font-size: 1.15rem; flex-shrink: 0;"></i>
                      <div style="overflow: hidden; text-align: left;">
                        <div style="font-weight: 700; font-size: 0.78rem; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${name}">${name}</div>
                        <div style="font-size: 0.67rem; color: var(--text-muted);">${info.ext} • ${sizeStr}</div>
                      </div>
                    </div>
                    <div style="display: flex; gap: 0.3rem; flex-shrink: 0;">
                      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.previewDoubtAttachmentById('${doubt.id}', ${aIdx})" style="font-size: 0.7rem; padding: 0.2rem 0.5rem;">
                        ${info.isCode ? 'View Code' : 'Preview'}
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.downloadDoubtAttachmentById('${doubt.id}', ${aIdx})" style="font-size: 0.7rem; padding: 0.2rem 0.45rem;" title="Download">
                        <i class="fa-solid fa-download"></i>
                      </button>
                    </div>
                  </div>
                `;
        }).join('')}
            </div>
          </div>
        `;
      };

      const renderAnswerAttachmentCardsList = (doubt) => {
        const primaryAnswer = doubt.answers?.[0] || null;
        const atts = doubt.answer_attachments || primaryAnswer?.attachments || [];
        if (atts.length === 0) return '';

        return `
          <div style="margin-top: 0.5rem;">
            <div style="font-size: 0.74rem; font-weight: 700; color: #10b981; margin-bottom: 0.3rem;">
              📎 Solution Files (${atts.length}):
            </div>
            <div style="display: grid; grid-template-columns: 1fr; gap: 0.4rem;">
              ${atts.map((att, aIdx) => {
          const info = this.getFileIconInfo(att.file_name, att.file_type);
          const name = escapeHtml(att.file_name || 'solution_file');
          const sizeStr = this.formatBytes(att.file_size || att.size);
          return `
                  <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-sm); padding: 0.4rem 0.7rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.55rem; overflow: hidden; flex: 1;">
                      <i class="${info.icon}" style="color: ${info.color}; font-size: 1.15rem; flex-shrink: 0;"></i>
                      <div style="overflow: hidden; text-align: left;">
                        <div style="font-weight: 700; font-size: 0.78rem; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${name}</div>
                        <div style="font-size: 0.67rem; color: var(--text-muted);">${info.ext} • ${sizeStr}</div>
                      </div>
                    </div>
                    <div style="display: flex; gap: 0.3rem; flex-shrink: 0;">
                      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.previewAnswerAttachmentById('${doubt.id}', ${aIdx})" style="font-size: 0.7rem; padding: 0.2rem 0.5rem;">
                        ${info.isCode ? 'View Code' : 'Preview'}
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.downloadAnswerAttachmentById('${doubt.id}', ${aIdx})" style="font-size: 0.7rem; padding: 0.2rem 0.45rem;">
                        <i class="fa-solid fa-download"></i>
                      </button>
                    </div>
                  </div>
                `;
        }).join('')}
            </div>
          </div>
        `;
      };

      container.innerHTML = filtered.map(t => {
        const isAuthor = Boolean(currentUserId && (t.raised_by_user_id === currentUserId || t.student_id === currentUserId));
        const isAcceptedByMe = Boolean(currentUserId && (t.accepted_by_user_id === currentUserId || t.support_mentor_id === currentUserId || (t.answers && t.answers.some(a => a.answered_by_user_id === currentUserId))));
        const isOpen = (t.status === 'OPEN');
        const isAccepted = (t.status === 'ACCEPTED' || t.status === 'CLAIMED');
        const isResolved = (t.status === 'RESOLVED' || t.status === 'CLOSED');

        const authorName = t.raised_by_name || t.student_name || t.raised_by_user_id || 'Student';
        const solverName = t.accepted_by_name || t.support_mentor_name || t.accepted_by_user_id || 'Assigned Mentor';
        const categoryLabel = t.category || t.course || t.skill_name || 'Technical Doubt';

        const statusClass = isOpen ? 'open' : (isAccepted ? 'claimed' : 'resolved');
        const statusBadgeHtml = isOpen
          ? `<span class="support-status-pill open" style="background: rgba(245, 158, 11, 0.15); color: #d97706; font-weight: 800;"><i class="fa-solid fa-clock"></i> OPEN</span>`
          : (isAccepted
            ? `<span class="support-status-pill claimed" style="background: rgba(37, 99, 235, 0.15); color: #2563eb; font-weight: 800;"><i class="fa-solid fa-spinner fa-spin"></i> ACCEPTED</span>`
            : `<span class="support-status-pill resolved" style="background: rgba(16, 185, 129, 0.15); color: #059669; font-weight: 800;"><i class="fa-solid fa-circle-check"></i> RESOLVED</span>`);

        return `
          <div class="support-card status-${statusClass}" id="doubtCard_${t.id}">
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              <div class="support-card-top">
                <div class="support-badge-group">
                  <span class="support-tag tag-skill"><i class="fa-solid fa-book-open"></i> ${escapeHtml(categoryLabel)}</span>
                  ${t.course && t.course !== categoryLabel ? `<span class="support-tag tag-concept">${escapeHtml(t.course)}</span>` : ''}
                </div>
                ${statusBadgeHtml}
              </div>

              <!-- Question Title & Description -->
              <div>
                <h3 class="support-card-title">${escapeHtml(t.title)}</h3>
                <p class="support-card-desc" style="margin-top: 0.35rem;">${escapeHtml(t.description)}</p>
              </div>

              <!-- Code Snippet Box -->
              ${t.code_snippet ? `
                <pre class="support-code-box"><code>${escapeHtml(t.code_snippet)}</code></pre>
              ` : ''}

              <!-- Uploaded Attachments -->
              ${renderAttachmentCardsList(t)}

              <!-- ACCEPTED State Info Banner -->
              ${isAccepted ? `
                ${isAcceptedByMe ? `
                  <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.25); border-radius: var(--radius-md); padding: 0.65rem 0.85rem; font-size: 0.8rem; color: #1d4ed8; font-weight: 700; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <span><i class="fa-solid fa-circle-check" style="color: #2563eb;"></i> You accepted this doubt. Write and submit your answer below.</span>
                    <span style="background: #2563eb; color: #ffffff; padding: 0.15rem 0.45rem; border-radius: var(--radius-sm); font-size: 0.7rem;">Your Task</span>
                  </div>
                ` : (isAuthor ? `
                  <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.25); border-radius: var(--radius-md); padding: 0.65rem 0.85rem; font-size: 0.8rem; color: #1d4ed8; font-weight: 700;">
                    <i class="fa-solid fa-user-check" style="color: #2563eb;"></i> Your doubt has been accepted by <strong>${escapeHtml(solverName)}</strong>. ⏳ Waiting for the solution...
                  </div>
                ` : `
                  <div style="background: rgba(100, 116, 139, 0.08); border: 1px solid rgba(100, 116, 139, 0.2); border-radius: var(--radius-md); padding: 0.65rem 0.85rem; font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">
                    <i class="fa-solid fa-lock" style="color: #64748b;"></i> Accepted by <strong>${escapeHtml(solverName)}</strong>. Mentor is currently solving this doubt.
                  </div>
                `)}
              ` : ''}

              <!-- RESOLVED Solution Box -->
              ${isResolved ? `
                <div class="support-solution-box">
                  <div class="support-solution-header">
                    <span><i class="fa-solid fa-user-check"></i> Answered by ${escapeHtml(solverName)}</span>
                    <span style="font-weight: 800; color: var(--accent-emerald);">+${t.reward_credits || '1.5'} Cr Bounty</span>
                  </div>
                  <div style="font-size: 0.74rem; font-weight: 700; color: var(--text-muted);">
                    Classification: <span style="color: var(--primary);">${escapeHtml(t.mentor_classification || 'Level 1: Syntax / Typo')}</span>
                  </div>
                  <div class="support-solution-body">${escapeHtml(t.mentor_solution || 'Verified solution provided.')}</div>

                  <!-- Answer Solution Attachments -->
                  ${renderAnswerAttachmentCardsList(t)}

                  ${t.recommended_assessment_skill ? `
                    <div class="support-quiz-recommendation-cta">
                      <div>
                        <strong>🎯 Follow-Up Assessment:</strong> Take 20-Q AI Quiz in <em>${escapeHtml(t.recommended_assessment_skill)}</em>
                      </div>
                      <button class="btn btn-primary btn-sm" style="font-size: 0.72rem; padding: 0.25rem 0.6rem;" onclick="window.app.startQuiz('${t.recommended_assessment_skill}')">
                        <i class="fa-solid fa-play"></i> Take Quiz
                      </button>
                    </div>
                  ` : ''}

                  <!-- Rating Section with 3-Star Reward Gate Feedback -->
                  ${isAuthor ? `
                    <div style="border-top: 1px dashed var(--border-subtle); padding-top: 0.75rem; margin-top: 0.5rem; background: ${t.rating ? 'rgba(16, 185, 129, 0.04)' : 'rgba(245, 158, 11, 0.04)'}; border-radius: var(--radius-md); padding: 0.75rem;">
                      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                        <div>
                          <div style="font-size: 0.88rem; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 0.35rem;">
                            <span>${t.rating ? 'Student Rating (Submitted & Locked):' : 'Rate Mentor\'s Solution:'}</span>
                          </div>
                          <div style="font-size: 0.73rem; color: var(--text-secondary); margin-top: 0.2rem;">
                            ${t.rating
                 ? (t.rating >= 3
                   ? `<span style="color: #059669; font-weight: 700;">🎉 Rated ${t.rating}★ — +${t.reward_credits || 0.5} Cr bounty released to mentor!</span>`
                   : `<span style="color: #d97706; font-weight: 700;">⭐ Rated ${t.rating}★ (Feedback saved. Mentor bounty requires rating ≥ 3★).</span>`)
                 : `Rate 3★ or above to release +${t.reward_credits || 0.5} Cr bounty to mentor.`}
                          </div>
                        </div>
                        ${t.rating ? `
                          <div style="display: flex; gap: 0.25rem; align-items: center;" title="Rating Locked (${t.rating} Stars)">
                            ${[1, 2, 3, 4, 5].map(star => `
                              <i class="fa-${t.rating >= star ? 'solid' : 'regular'} fa-star" style="color: #f59e0b; font-size: 1.25rem;"></i>
                            `).join('')}
                          </div>
                        ` : `
                          <div class="support-star-rating">
                            ${[1, 2, 3, 4, 5].map(star => `
                              <button type="button" class="star-btn" onclick="window.app.rateSupportTicket('${t.id}', ${star})" title="Rate ${star} Stars">
                                <i class="fa-${(t.rating || 0) >= star ? 'solid' : 'regular'} fa-star" style="color: #f59e0b; font-size: 1.25rem;"></i>
                              </button>
                            `).join('')}
                          </div>
                        `}
                      </div>
                    </div>
                  ` : (isAcceptedByMe ? `
                    ${t.rating ? `
                      <div style="border-top: 1px dashed var(--border-subtle); margin-top: 0.5rem; background: ${t.rating >= 3 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)'}; border: 1.5px solid ${t.rating >= 3 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}; border-radius: var(--radius-md); padding: 0.75rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                          <div>
                            <div style="font-size: 0.88rem; font-weight: 800; color: ${t.rating >= 3 ? '#059669' : '#d97706'}; display: flex; align-items: center; gap: 0.4rem;">
                              <i class="fa-solid fa-${t.rating >= 3 ? 'trophy' : 'star'}"></i>
                              <span>Student Rating: ${t.rating} / 5 Stars</span>
                            </div>
                            <div style="font-size: 0.76rem; color: var(--text-primary); margin-top: 0.25rem; font-weight: 600;">
                              ${t.rating >= 3
                  ? `🎉 +${t.reward_credits || 0.5} Credits bounty deposited into your wallet! Your score & balance have increased.`
                  : `⚠️ Student rated ${t.rating}★. Mentor credit bounty requires 3★ or above.`}
                            </div>
                          </div>
                          <div class="support-star-rating">
                            ${[1, 2, 3, 4, 5].map(star => `
                              <i class="fa-${(t.rating || 0) >= star ? 'solid' : 'regular'} fa-star" style="color: #f59e0b; font-size: 1.25rem;"></i>
                            `).join('')}
                          </div>
                        </div>
                      </div>
                    ` : `
                      <div style="border-top: 1px dashed var(--border-subtle); padding-top: 0.6rem; margin-top: 0.4rem; background: rgba(37, 99, 235, 0.06); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: var(--radius-md); padding: 0.65rem 0.85rem; font-size: 0.78rem; color: #1d4ed8; font-weight: 600; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.45rem;">
                          <i class="fa-solid fa-hourglass-half fa-spin"></i>
                          <span>Waiting for student to review & rate solution.</span>
                        </div>
                        <span style="font-size: 0.72rem; background: #2563eb; color: #fff; padding: 0.15rem 0.5rem; border-radius: var(--radius-sm); font-weight: 700;">
                          +${t.reward_credits || 0.5} Cr on ≥3★
                        </span>
                      </div>
                    `}
                  ` : `
                    ${t.rating ? `
                      <div style="border-top: 1px dashed var(--border-subtle); padding-top: 0.6rem; margin-top: 0.4rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.4rem;">
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                          <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary);">Student Rating:</span>
                          <span style="font-size: 0.82rem; font-weight: 800; color: ${t.rating >= 3 ? '#10b981' : '#f59e0b'};">
                            ${t.rating} / 5 Stars ${t.rating >= 3 ? '(Reward Released ✓)' : ''}
                          </span>
                        </div>
                        <div class="support-star-rating">
                          ${[1, 2, 3, 4, 5].map(star => `
                            <i class="fa-${(t.rating || 0) >= star ? 'solid' : 'regular'} fa-star" style="color: #f59e0b; font-size: 1.15rem;"></i>
                          `).join('')}
                        </div>
                      </div>
                    ` : `
                      <div style="border-top: 1px dashed var(--border-subtle); padding-top: 0.5rem; margin-top: 0.35rem; font-size: 0.74rem; color: var(--text-muted); text-align: right;">
                        <i class="fa-solid fa-clock"></i> Awaiting Student Rating (3★ or above releases +${t.reward_credits || 0.5} Cr mentor bounty)
                      </div>
                    `}
                  `)}
                </div>
              ` : ''}
            </div>

            <!-- Footer Meta & Actions -->
            <div style="margin-top: 0.75rem;">
              <div class="support-meta-row">
                <div>
                  <i class="fa-regular fa-user"></i> Asked by: <strong>${escapeHtml(authorName)}</strong>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openViewFullDoubtModal('${t.id}')" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;">
                    <i class="fa-solid fa-expand"></i> Details
                  </button>
                  <div class="support-bounty-badge">
                    <i class="fa-solid fa-coins"></i> ${isOpen ? `Bounty: +${t.reward_credits || '1.5'} Cr` : (isResolved ? `Awarded: +${t.reward_credits} Cr` : 'In Triage')}
                  </div>
                </div>
              </div>

              <!-- Action Buttons according to State & Persona Permissions -->
              <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                ${isOpen && !isAuthor ? `
                  <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="window.app.acceptSupportDoubt('${t.id}', this)">
                    <i class="fa-solid fa-hand-holding-hand"></i> Accept Doubt (+${t.reward_credits || 1.5} Cr)
                  </button>
                ` : ''}

                ${isOpen && isAuthor ? `
                  <div style="font-size: 0.78rem; color: #d97706; font-weight: 700; display: flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0;">
                    <i class="fa-solid fa-hourglass-half"></i> Open • Waiting for a peer tutor to accept (0 Cr cost)
                  </div>
                ` : ''}

                ${isAccepted && isAcceptedByMe ? `
                  <button class="btn btn-emerald btn-sm" style="flex: 1; background: #10b981; border-color: #10b981; color: white;" onclick="window.app.openResolveSupportModal('${t.id}')">
                    <i class="fa-solid fa-graduation-cap"></i> Submit Answer (+${t.reward_credits || 1.5} Cr)
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    },

    startSessionTimer(session) {
      if (this.timerInterval) clearInterval(this.timerInterval);
      const display = document.getElementById('sessionTimerDisplay');

      const isOneOnOne = session && session.session_type !== 'GROUP_COHORT';
      const hasBothJoined = session && (
        session.meeting_started_at ||
        (window.skillSwapConference && window.skillSwapConference.remoteUsers && window.skillSwapConference.remoteUsers.size > 0)
      );

      const currentPersona = window.store?.getCurrentPersona() || {};
      const isTeacher = session && (session.teacher_id === currentPersona.id || session.teacher?.id === currentPersona.id);

      if (isOneOnOne && !hasBothJoined && display) {
        display.textContent = isTeacher ? 'Waiting for student to join' : 'Waiting for host to join';
        return;
      }

      if (session) {
        const totalDurationSecs = Math.round((Number(session.hours) || 1) * 3600);
        if (session.meeting_started_at) {
          const rawDateStr = String(session.meeting_started_at).trim();
          const isoUtcStr = rawDateStr.includes('T') ? (rawDateStr.endsWith('Z') ? rawDateStr : rawDateStr + 'Z') : (rawDateStr.replace(' ', 'T') + 'Z');
          const startedMs = new Date(isoUtcStr).getTime() || Date.now();
          const nowMs = Date.now();
          const elapsedSecs = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
          this.timerSeconds = Math.max(0, totalDurationSecs - elapsedSecs);
        } else {
          this.timerSeconds = totalDurationSecs;
        }
      }

      if (this.timerSeconds <= 0) {
        if (display) display.textContent = '00:00:00 SESSION ENDED';
        if (window.skillSwapConference && window.skillSwapConference.handleRemoteSessionEnded) {
          window.skillSwapConference.handleRemoteSessionEnded('The scheduled session time has expired.');
        }
        return;
      }

      const updateDisplay = () => {
        if (!display) return;
        const hrs = String(Math.floor(this.timerSeconds / 3600)).padStart(2, '0');
        const mins = String(Math.floor((this.timerSeconds % 3600) / 60)).padStart(2, '0');
        const secs = String(this.timerSeconds % 60).padStart(2, '0');
        display.textContent = `${hrs}:${mins}:${secs} REMAINING`;
      };

      updateDisplay();

      this.timerInterval = setInterval(() => {
        if (this.timerSeconds > 0) {
          this.timerSeconds--;
          updateDisplay();
        } else {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
          if (display) display.textContent = '00:00:00 SESSION ENDED';
          if (window.skillSwapConference && window.skillSwapConference.handleRemoteSessionEnded) {
            window.skillSwapConference.handleRemoteSessionEnded('The scheduled session time has expired.');
          }
        }
      }, 1000);
    },

    stopSessionTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      const display = document.getElementById('sessionTimerDisplay');
      if (display) {
        display.textContent = '00:00:00 SESSION ENDED';
      }
    },

    showToast(message, iconType = 'info') {
      const container = document.getElementById('toastContainer');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = 'toast';

      let icon = 'fa-circle-info';
      if (iconType === 'check' || iconType === 'coins') icon = 'fa-circle-check" style="color: var(--accent-emerald);';
      if (iconType === 'lock') icon = 'fa-lock" style="color: var(--accent-amber);';
      if (iconType === 'plus') icon = 'fa-plus-circle" style="color: var(--primary);';
      if (iconType === 'message') icon = 'fa-comment" style="color: var(--secondary);';
      if (iconType === 'user') icon = 'fa-user-astronaut" style="color: var(--primary);';

      toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="toast-text">
          <h5>SkillSwap Merit Update</h5>
          <p>${message}</p>
        </div>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    },

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    escapeQuotes(str) {
      if (!str) return '';
      return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }
  };

  window.app = app;

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    app.init();
  } else {
    document.addEventListener('DOMContentLoaded', async () => {
      window.app = app;
      await app.init();
    });
  }
})();
