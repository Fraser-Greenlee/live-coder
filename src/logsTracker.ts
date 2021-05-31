import * as vscode from "vscode";
import * as lineReader from "line-reader";
import * as pathModule from "path";
import * as fs from "fs";
import { LiveValuesPanel } from "./LiveValuesPanel";
import { parseExecution } from "./logsParser";
import { AllFiles } from "./executionClasses";
import { renderCalls } from "./logsRenderCalls";
import { renderFiles } from "./logsRenderFiles";


function getCurrentFiles(liveCoderFolder: string) {
    let logFiles: {path: string, command: string}[] = new Array();
    fs.readdir(liveCoderFolder, (err, files) => {
        files.forEach(file => {
            if (!file.endsWith('.txt')) {
                return;
            }
            lineReader.eachLine(pathModule.join(liveCoderFolder, file), (line) => {
                // first line should have command for file
                logFiles.push({path: file, command: line});
                return false;
            });
        });
    });
    return logFiles;
}


export class LogsTracker {

    public logsFolder: string;
    public selectedLogPath: string;
    public logFilesWithCommands: {path: string, command: string}[];
    public renders: {
        [logsPath: string]: {
            [path: string]: string
        }
    } = {};
    public selectedCallIds: {
        [path: string]:  {
            [func: string]: string
        }
    } = {};
    public callIdToFunction: {
        [callId: string]: {
            [pathOrFunctionName: string]: string
        }
    } = {};

	public constructor() {
        this.logsFolder = pathModule.join(vscode.workspace.workspaceFolders![0].uri.path, '.live_coder');
        this.logFilesWithCommands = new Array();
        this.selectedLogPath = '';

        this.refresh();
        fs.watch(this.logsFolder, (eventType, filename) => {
            // could be either 'rename' or 'change'. new file event and delete
            // also generally emit 'rename'
            console.log(eventType, filename);
            // this.refresh();
        });
	}

    public noneSelected() {
        return this.selectedLogPath === '';
    }

    public refresh() {
        this.logFilesWithCommands = getCurrentFiles(this.logsFolder);
        this.render();
        if (LiveValuesPanel.currentPanel) {
            LiveValuesPanel.currentPanel.refreshWebview();
        }
    }

    public getRender(path: string) {
        if (!this.selectedLogPath) {
            return `
                <div class="centre">
                    <div class="widthLimiter">
                        <span><b>No active test or log file.</b> Select a test method or log file from the dropdown above.</span>
                    </div>
                </div>
            `;
        }
        if (!(this.selectedLogPath in this.renders)) {
            this.render(); // populate `this.renders`
        }
        if (path in this.renders[this.selectedLogPath]) {
            return this.renders[this.selectedLogPath][path];
        } else {
            return '<h1>no logs for this file</h1>';
        }
    }

    private getSelectedCallIds(
        selectedCallIds: { [path: string]:  {[func: string]: string} },
        callIdToFunction: { [callId: string]: {[pathOrFunctionName: string]: string} }
    ) {
        const callIds: string[] = Object.keys(callIdToFunction);
        callIds.sort();
        callIds.forEach(callId => {
            const path = callIdToFunction[callId]['path'];
            const functionName = callIdToFunction[callId]['functionName'];
    
            if (!(path in selectedCallIds)) {
                selectedCallIds[path] = {
                    functionName: callId
                };
            } else if (!(functionName in selectedCallIds[path])) {
                selectedCallIds[path][functionName] = callId;
            } else if (!(selectedCallIds[path][functionName] in callIds)) {
                selectedCallIds[path][functionName] = callId;
            }
        });
        return selectedCallIds;
    }    

    public render() {
        if (this.selectedLogPath) {
            let lines: string[] = new Array();
            lineReader.eachLine(this.logsFolder + this.selectedLogPath, (line) => {
                lines.push(line);
            });
            const parse: AllFiles = parseExecution(lines);
            const {funcCallRender, callIdToFunction} = renderCalls(parse);
            this.selectedCallIds = this.getSelectedCallIds(this.selectedCallIds, callIdToFunction);
            this.callIdToFunction = callIdToFunction;
            this.renders[this.selectedLogPath] = renderFiles(funcCallRender, this.selectedCallIds);
        }
    }
}
