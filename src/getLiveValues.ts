/*

# OLD FILE

*/
import * as vscode from "vscode";
import { exec, ExecException } from 'child_process';
import { LiveValuesPanel } from "./LiveValuesPanel";


function runTest(testId: string) {
    var runTestPromise = new Promise((resolve, reject) => {
        const pythonPath: string = vscode.workspace.getConfiguration('python').get('pythonPath')!;
        exec(`${pythonPath} -m unittest ${testId}`, {cwd: vscode.workspace.workspaceFolders![0].uri.path}, (error: ExecException | null, stdout: string, stderr: string) => {
            if (error) {
                reject(stderr);
            } else {
                if (LiveValuesPanel.currentPanel) {
                    LiveValuesPanel.currentPanel.stdout = stdout;
                    LiveValuesPanel.currentPanel.stderr = stderr;
                }
                resolve('completed');
            }
        });
    });

    var timeoutPromise = new Promise(function(resolve) { 
        setTimeout(resolve, 10000, "Took too long to run test."); 
    });
    return Promise.race([runTestPromise, timeoutPromise]).then(function(value) {
        if (value === 'completed') {
            LiveValuesPanel.currentPanel!.testMethods = LiveValuesPanel.currentPanel!.stdout.trim().split('\n');
            LiveValuesPanel.currentPanel!.refreshWebview();
        } else {
            vscode.window.showErrorMessage(String(value));
        }
    });
}


export async function makeLiveValues(testId: string) {
    let z = testId;
    return {
        'type': 'error'
    };
}
