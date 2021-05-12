// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { LiveValuesPanel } from './LiveValuesPanel';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(
		vscode.commands.registerCommand('live-coder.liveValues', () => {
			LiveValuesPanel.createOrShow(context.extensionUri);
			if (LiveValuesPanel.badSettingsError()) {
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
		vscode.commands.registerCommand("live-coder.kill", async () => {
		  LiveValuesPanel.kill();
		})
	);
}

// this method is called when your extension is deactivated
export function deactivate() {}
