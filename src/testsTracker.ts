import * as vscode from "vscode";
import { exec, ExecException } from 'child_process';
import { resolve } from "dns";


export class TestsTracker {

    public static stdout: String = '';
    public static stderr: String = '';
	public static testMethods: String[] = [];
    public currentTestMethodIndex: number = -1;

    public constructor() {

    }

    public noneSelected() {
        return this.currentTestMethodIndex === -1;
    }

    public async runTest() {
        // TODO: run test in VSCode Terminal

        // OLD
		let response = this._getLiveValues();
		response.then((liveValuesAndTestOutput) => {
			if (liveValuesAndTestOutput === undefined) {
                const pythonPath: string = vscode.workspace.getConfiguration('python').get('pythonPath')!;
				this._panel.webview.html = this._errorHTML(
					`<b>Error</b> Unable to run test.
                    Try running it yourself with <code>${pythonPath} -m unittest ${method}</code>`
				);
			} else {
				this._currentTestMethodIndex = methodIndex;
				this._panel.webview.html = this._liveValuesHTML(
					liveValuesAndTestOutput[0],
					liveValuesAndTestOutput[1]
				);
			}
		});
    }

    public async refreshTestMethods() {
        TestsTracker.stdout = '';
        TestsTracker.stderr = '';
		var queryTestsPromise = new Promise((resolve, reject) => {
            const pythonPath: string = vscode.workspace.getConfiguration('python').get('pythonPath')!;
            const listsTests: string = `
import unittest

def print_suite(suite):
    if hasattr(suite, '__iter__'):
        for x in suite:
            print_suite(x)
    else:
        print(suite.id())

print_suite(unittest.defaultTestLoader.discover('.'))
`;
			exec(`${pythonPath} -c "${listsTests}"`, {cwd: vscode.workspace.workspaceFolders![0].uri.path}, (error: ExecException | null, stdout: string, stderr: string) => {
				if (error) {
					reject(stderr);
				} else {
                    TestsTracker.stdout = stdout;
                    TestsTracker.stderr = stderr;
					resolve('completed');
				}
			});
		});

		var timeoutPromise = new Promise(function(resolve) { 
			setTimeout(resolve, 7000, "Took too long to discover unittests."); 
		});
		return Promise.race([queryTestsPromise, timeoutPromise]).then(function(value) {
			if (value === 'completed') {
                TestsTracker.testMethods = TestsTracker.stdout.trim().split('\n');
                return true;
            } else {
                vscode.window.showErrorMessage(String(value));
                return false;
            }
		});
	}
}