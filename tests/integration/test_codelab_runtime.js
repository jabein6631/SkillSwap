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
if (codelab.problems.length !== 18) throw new Error('Expected 18 total problems across stages');
codelab.setProblemFilter('CODING');
if (codelab.problemFilter !== 'CODING') throw new Error('Problem filter failed');
console.log('✅ Step 3 verified with problems list and filtering.');

// Test 4: Step 4: Problem Solving IDE
console.log('Testing Step 4: Problem Solving IDE...');
codelab.openProblem('two-sum');
if (codelab.currentStep !== 4) throw new Error('Expected step 4 (IDE)');
if (codelab.currentProblemId !== 'two-sum') throw new Error('Expected problem two-sum');

// TEST 1: Editor starts completely blank
const editor = global.document.getElementById('codelabCodeEditor');
if (editor.value !== '') throw new Error('TEST 1 FAIL: Editor is not blank');
console.log('✅ TEST 1 PASS: Editor is completely blank on open.');

// TEST 2: Click Run Code without entering anything -> "Please write your solution first."
codelab.runCode();
const outputBody = global.document.getElementById('codelabOutputBody');
if (!outputBody.innerHTML.includes('Please write your solution first.')) {
  throw new Error('TEST 2 FAIL: Expected "Please write your solution first." message');
}
console.log('✅ TEST 2 PASS: Empty editor prevents execution and displays warning.');

// TEST 3: Correct Python3 solution -> Run Code -> ✓ Correct Answer
editor.value = `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen = {}
        for i, n in enumerate(nums):
            diff = target - n
            if diff in seen:
                return [seen[diff], i]
            seen[n] = i
        return []`;

const correctRes = codelab.executePython3(editor.value, codelab.problems[0].testCases[0], 'two-sum');
if (correctRes.status !== 'CORRECT') throw new Error(`TEST 3 FAIL: Expected CORRECT status, got ${correctRes.status}`);
console.log('✅ TEST 3 PASS: Correct Python3 solution executed and verified (✓ Correct Answer).');

// TEST 4: Incorrect solution -> Run Code -> ✗ Wrong Answer
editor.value = `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        return [0, 0]`;

const wrongRes = codelab.executePython3(editor.value, codelab.problems[0].testCases[0], 'two-sum');
if (wrongRes.status !== 'WRONG_ANSWER') throw new Error(`TEST 4 FAIL: Expected WRONG_ANSWER status, got ${wrongRes.status}`);
console.log('✅ TEST 4 PASS: Incorrect solution detected and output compared (✗ Wrong Answer).');

// TEST 5: Invalid Python syntax -> Run Code -> Runtime Error
editor.value = `class Solution:
    def twoSum(self, nums target)
        return [0, 1]`;

const errorRes = codelab.executePython3(editor.value, codelab.problems[0].testCases[0], 'two-sum');
if (errorRes.status !== 'RUNTIME_ERROR') throw new Error(`TEST 5 FAIL: Expected RUNTIME_ERROR status, got ${errorRes.status}`);
console.log('✅ TEST 5 PASS: Python syntax/runtime error caught (Runtime Error).');

// TEST 7: Submit solution -> Mark submitted -> Redirect -> Show "Submitted ✓" button
codelab.openProblem('two-sum');
editor.value = `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen = {}
        for i, n in enumerate(nums):
            diff = target - n
            if diff in seen:
                return [seen[diff], i]
            seen[n] = i
        return []`;

codelab.submitSolution();
setTimeout(() => {
  if (!codelab.submittedProblemIds.has('two-sum')) throw new Error('TEST 7 FAIL: Problem two-sum was not marked as submitted');
  console.log('✅ TEST 7 PASS: Submitted solution marked problem as submitted and redirected.');

  codelab.backToProblems();
  if (codelab.currentStep !== 3) throw new Error('Expected step 3 after back');

  console.log('🎉 ALL REQUIRED CODE LAB TEST SUITES PASSED 100%!');
}, 600);
