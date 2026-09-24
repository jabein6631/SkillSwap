const fs = require('fs');

// Create mock browser DOM environment
global.window = {};
global.document = {
  elements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = {
        id,
        innerHTML: '',
        style: {},
        value: '',
        split: () => ['1', '2'],
        querySelectorAll: () => [],
        classList: {
          add: () => {},
          remove: () => {},
          toggle: () => {}
        }
      };
    }
    return this.elements[id];
  },
  querySelectorAll() {
    return [];
  }
};
global.window.scrollTo = () => {};
global.window.app = {
  showToast: (msg, icon) => console.log(`[Toast] ${icon}: ${msg}`)
};

// Load codelab.js code
const code = fs.readFileSync('frontend/js/codelab.js', 'utf8');
eval(code);

console.log('Testing CodeLabModule runtime execution...');
const codelab = global.window.codelab;

// Test 1: Initial state
console.log('Testing Step 1: Select Subject...');
codelab.init();
if (codelab.currentStep !== 1) throw new Error('Expected step 1');
if (codelab.subjects.length !== 12) throw new Error('Expected 12 subjects');
codelab.selectSubject('Python');
if (codelab.selectedSubject !== 'Python') throw new Error('Subject selection failed');
console.log('✅ Step 1 verified with 12 subjects and selection.');

// Test 2: Step 2: Choose Difficulty
console.log('Testing Step 2: Choose Difficulty...');
codelab.setStep(2);
if (codelab.currentStep !== 2) throw new Error('Expected step 2');
if (codelab.difficulties.length !== 3) throw new Error('Expected 3 difficulties');
codelab.selectDifficulty('Advanced');
if (codelab.selectedDifficulty !== 'Advanced') throw new Error('Difficulty selection failed');
console.log('✅ Step 2 verified with 3 difficulty tiers and selection.');

// Test 3: Step 3: Start Solving (Problems list)
console.log('Testing Step 3: Start Solving...');
codelab.setStep(3);
if (codelab.currentStep !== 3) throw new Error('Expected step 3');
if (codelab.problems.length !== 6) throw new Error('Expected 6 problems');
codelab.setProblemFilter('CODING');
if (codelab.problemFilter !== 'CODING') throw new Error('Problem filter failed');
console.log('✅ Step 3 verified with problems list and filtering.');

// Test 4: Step 4: Problem Solving IDE
console.log('Testing Step 4: Problem Solving IDE...');
codelab.openProblem('two-sum');
if (codelab.currentStep !== 4) throw new Error('Expected step 4 (IDE)');
if (codelab.currentProblemId !== 'two-sum') throw new Error('Expected problem two-sum');

// Test IDE Tabs
codelab.setIdeTab('examples');
if (codelab.activeIdeTab !== 'examples') throw new Error('IDE tab failed');
codelab.setIdeTab('constraints');
codelab.setIdeTab('hints');
codelab.setIdeTab('description');

// Test Language Switcher
codelab.setLanguage('javascript');
if (codelab.selectedLanguage !== 'javascript') throw new Error('Language switch failed');

// Test Timer
codelab.toggleTimer();
if (!codelab.timerRunning) throw new Error('Timer should be running');
codelab.toggleTimer();
if (codelab.timerRunning) throw new Error('Timer should be stopped');

// Test Run Code
console.log('Testing Run Code & Output...');
codelab.runCode();

// Test Submit Solution
console.log('Testing Submit Solution...');
const prevSolved = codelab.solvedCount;
codelab.submitSolution();

// Test Back to Problems
console.log('Testing Back to Problems navigation...');
codelab.backToProblems();
if (codelab.currentStep !== 3) throw new Error('Expected step 3 after back');

console.log('🎉 ALL RUNTIME UNIT TESTS PASSED SUCCESSFULLY!');
