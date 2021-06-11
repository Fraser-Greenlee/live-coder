// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { LiveValuesPanel } from './LiveValuesPanel';

function _newFileCouldHaveLiveValues() {
	return LiveValuesPanel.currentPanel 
		&& vscode.window.activeTextEditor
		&& isPython(vscode.window.activeTextEditor)
		&& LiveValuesPanel.currentPanel.isNewActiveEditor(vscode.window.activeTextEditor);
}

function isPython(activeTextEditor: vscode.TextEditor) {
	const fileName: string = activeTextEditor.document.fileName;
	const potentialPy: string = fileName.substr(fileName.length - 3);
	return potentialPy === '.py';
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(
		vscode.commands.registerCommand('live-coder.liveValues', () => {
			if (!LiveValuesPanel.createOrShow(context.extensionUri)) {
				setTimeout(() => {
					LiveValuesPanel.kill();
				}, 500);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("live-coder.refresh", async () => {
		  LiveValuesPanel.kill();
		  LiveValuesPanel.createOrShow(context.extensionUri);
		  // setTimeout(() => {
		  //   vscode.commands.executeCommand(
		  //     "workbench.action.webview.openDeveloperTools"
		  //   );
		  // }, 500);
		})
	);

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorVisibleRanges(event => {
			if (LiveValuesPanel.currentPanel && Date.now() - LiveValuesPanel.currentPanel.webviewLastScrolled > 50) {
				LiveValuesPanel.currentPanel.scrollPanel(event.textEditor);
			}
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            if (_newFileCouldHaveLiveValues()) {
                LiveValuesPanel.currentPanel!.refreshWebview();
            }
        })
	);

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(() => {
            if (LiveValuesPanel.currentPanel && vscode.window.activeTextEditor && !LiveValuesPanel.currentPanel.testsTracker.noneSelected()) {
				LiveValuesPanel.currentPanel.testsTracker.runTest({});
            }
        })
	);
}

// this method is called when your extension is deactivated
export function deactivate() {}
