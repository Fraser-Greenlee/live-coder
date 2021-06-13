/* eslint-disable @typescript-eslint/naming-convention */
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { LogsTracker } from '../../logsTracker';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Parse Example', () => {
		let logsTracker = new LogsTracker();
		logsTracker.changeLogFile('testpy.txt');
		logsTracker.render();
		assert.notStrictEqual(
			{
				'/Users/Fraser/projects/active/live_coder_py_module/test_runs/test.py': {
					'my_method': '/Users/Fraser/projects/active/live_coder_py_module/test_runs/test.py:my_method:0',
					'test_my_method': '/Users/Fraser/projects/active/live_coder_py_module/test_runs/test.py:test_my_method:0'
				}
			},
			logsTracker.selectedCallIds
		);
	});
});
