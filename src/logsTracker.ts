import * as vscode from "vscode";
import * as readline from "readline";
import * as pathModule from "path";
import * as fs from "fs";
import { LiveValuesPanel } from "./LiveValuesPanel";
import { parseExecution } from "./logsParser";
import { AllFiles } from "./executionClasses";
import { renderCalls } from "./logsRenderCalls";
import { renderFiles } from "./logsRenderFiles";
import * as config from "./config";
import { split } from "./utils";


async function getLogFiles(liveCoderFolder: string) {
    let logFiles: {path: string, command: string}[] = new Array();
    var files = fs.readdirSync(liveCoderFolder);
    for (const file of files) {
        if (!file.endsWith('.txt') || !file.startsWith(config.lineKey)) {
            return;
        }

        const rl = readline.createInterface({
            input: fs.createReadStream(pathModule.join(liveCoderFolder, file)), //or fileStream 
            output: process.stdout
        });

        const it = rl[Symbol.asyncIterator]();
        const line1 = (await it.next()).value;
        if (typeof(line1) === "string") {
            logFiles.push({path: file, command: line1.substring(line1.length - 100, line1.length)});
        }
    }
    return logFiles;
}


export class LogsTracker {

    public logsPath: string;
    public selectedLogFile: string;
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
        this.logsPath = pathModule.join(vscode.workspace.workspaceFolders![0].uri.path, config.logsFolder);
        this.logFilesWithCommands = new Array();
        this.selectedLogFile = '';

        if (!fs.existsSync(this.logsPath)) {
            fs.mkdirSync(this.logsPath);
        }
        this.refresh();
        fs.watch(this.logsPath, (eventType, filename) => {
            // could be either 'rename' or 'change'. new file event and delete
            // also generally emit 'rename'
            console.log('watch', eventType, filename);
            if (this.selectedLogFile === filename) {
                this.refresh();
            }
        });
	}

    public noneSelected() {
        return this.selectedLogFile === '';
    }

    public refresh() {
        getLogFiles(this.logsPath).then((logFiles) => {
            this.logFilesWithCommands = logFiles!;
            this.render();
            if (LiveValuesPanel.currentPanel) {
                LiveValuesPanel.currentPanel.refreshWebview();
            }
        });
    }

    public getRender(path: string) {
        if (!this.selectedLogFile) {
            return `
                <div class="centre">
                    <div class="widthLimiter">
                        <span><b>No active test or log file.</b> Select a test method or log file from the dropdown above.</span>
                    </div>
                </div>
            `;
        }
        if (!(this.selectedLogFile in this.renders)) {
            this.render(); // populate `this.renders`
        }
        if (path in this.renders[this.selectedLogFile]) {
            return this.renders[this.selectedLogFile][path];
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
                selectedCallIds[path] = {};
                selectedCallIds[path][functionName] = callId;
            } else {
                selectedCallIds[path][functionName] = callId;
            }
        });
        return selectedCallIds;
    }    

    public render() {
        if (this.selectedLogFile) {
            let lines: string[] = split(
                fs.readFileSync(pathModule.join(this.logsPath, this.selectedLogFile)).toString(),
                "\n"
            );
            const parse: AllFiles = parseExecution(lines);
            const {funcCallRender, callIdToFunction} = renderCalls(parse);
            this.selectedCallIds = this.getSelectedCallIds(this.selectedCallIds, callIdToFunction);
            this.callIdToFunction = callIdToFunction;
            this.renders[this.selectedLogFile] = renderFiles(funcCallRender, this.selectedCallIds);
        }
    }
}
