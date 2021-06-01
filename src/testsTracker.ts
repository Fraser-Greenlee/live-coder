import * as vscode from "vscode";
import { exec, ExecException } from 'child_process';


export class TestsTracker {

    public static stdout: String = '';
    public static stderr: String = '';
	public static testMethods: String[] = [];
    public currentTestMethodIndex: number = -1;
    private terminal: vscode.Terminal;

    public constructor() {
        this.terminal = vscode.window.createTerminal(`Live Coder Test Runner`);
    }

    public noneSelected() {
        return this.currentTestMethodIndex === -1;
    }

    public deselect() {
        this.currentTestMethodIndex = -1;
    }

    private ensureTerminalExists() {
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal(`Live Coder Test Runner`);
        }
    }

    public async runTest({method = undefined}: {method?: string}) {
        console.log("runTest");
        if (method) {
            const methodIndex = TestsTracker.testMethods.indexOf(method);
            if (methodIndex === -1) {
                throw new Error('Got unknown test method');
            }
            this.currentTestMethodIndex = methodIndex;
        }
        this.ensureTerminalExists();
        const pythonPath: string | undefined = vscode.workspace.getConfiguration('python').get('pythonPath');
        if (pythonPath) {
            this.terminal.sendText(`${pythonPath} -m unittest ${method}`);
        } else {
            vscode.window.showErrorMessage("Need to set python.pythonPath in your settings.");
        }
    }

    public async findTestMethods() {
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
			setTimeout(resolve, 7000, "Took too long to discover tests."); 
		});
		return Promise.race([queryTestsPromise, timeoutPromise]).then(function(value) {
            const txtOutput = TestsTracker.stdout.trim();
			if (value === 'completed') {
                if (txtOutput) {
                    TestsTracker.testMethods = TestsTracker.stdout.trim().split('\n');
                    return true;
                } else {
                    vscode.window.showErrorMessage("No tests found. Be sure to have an `__init__.py` file in your tests folder.");
                    return false;                    
                }
            } else {
                vscode.window.showErrorMessage(String(value));
                return false;
            }
		});
	}
}