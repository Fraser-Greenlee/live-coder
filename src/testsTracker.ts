import * as vscode from "vscode";
import { exec, ExecException } from 'child_process';


function ensureTerminalExists(): boolean {
	if ((<any>vscode.window).terminals.length === 0) {
		vscode.window.showErrorMessage('No active terminals');
		return false;
	}
	return true;
}


function selectTerminal(): Thenable<vscode.Terminal | undefined> {
	interface TerminalQuickPickItem extends vscode.QuickPickItem {
		terminal: vscode.Terminal;
	}
	const terminals = <vscode.Terminal[]>(<any>vscode.window).terminals;
	const items: TerminalQuickPickItem[] = terminals.map(t => {
		return {
			label: `name: ${t.name}`,
			terminal: t
		};
	});
	return vscode.window.showQuickPick(items).then(item => {
		return item ? item.terminal : undefined;
	});
}


export class TestsTracker {

    public static stdout: String = '';
    public static stderr: String = '';
	public static testMethods: String[] = [];
    public static terminalId: number = 1;
    public currentTestMethodIndex: number = -1;

    public constructor() {
		vscode.window.createTerminal(`Ext Terminal #${TestsTracker.terminalId++}`);
		vscode.window.showInformationMessage('Hello World 2!');
    }

    public noneSelected() {
        return this.currentTestMethodIndex === -1;
    }

    public deselect() {
        this.currentTestMethodIndex = -1;
    }

    public async runTest({methodIndex = null, method = null}: {methodIndex?: number | null, method?: string | null}) {
        if (methodIndex) {
            if (TestsTracker.testMethods[methodIndex] !== method) {
                throw new Error('Got non matching test method');
            }
            this.currentTestMethodIndex = methodIndex;
        }
		if (ensureTerminalExists()) {
			selectTerminal().then(terminal => {
				if (terminal) {
                    // TODO use proper command
					terminal.sendText("echo 'Hello world!'");
				}
			});
		}
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