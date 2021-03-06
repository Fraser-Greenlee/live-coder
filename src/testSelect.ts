import { LogsTracker } from "./logsTracker";
import { TestsTracker } from "./testsTracker";

export class TestSelect {

    public logsTracker: LogsTracker;
	public testsTracker: TestsTracker;

    public constructor(testsTracker: TestsTracker, logsTracker: LogsTracker) {
        this.testsTracker = testsTracker;
        this.logsTracker = logsTracker;
    }

    private _previousRunOption(logFile: string, label: string) {
        var selected: string = '';
        if (this.logsTracker.selectedLogFile === logFile) {
            selected = 'selected';
        }
        return `<option value="${logFile}" data-field_type="logFile" ${selected}>${label}</option>`;
    }
    
    private _getPreviousRunsOptions() {
        if (!this.logsTracker.logFilesWithCommands) {
            return '';
        }
        const numLogFiles = this.logsTracker.logFilesWithCommands.length;
        let options: string[] = new Array(numLogFiles);
        for (let i = 0; i < numLogFiles; i++) {
            options[i] = this._previousRunOption(
                this.logsTracker.logFilesWithCommands[i].path,
                this.logsTracker.logFilesWithCommands[i].command
            );
        }
        return options.join('');
    }
    
    private _testMethodOption(methodIndex: number) {
        const name = TestsTracker.testMethods[methodIndex];
        let selected: string = '';
        if (methodIndex === this.testsTracker.currentTestMethodIndex) {
            selected = 'selected';
        }
        return `<option value="${name}" data-field_type="liveTest" ${selected}>${name}</option>`;
    }
    
    private _getTestMethodOptions() {
        let options: string[] = new Array(TestsTracker.testMethods.length);
        for (let i = 0; i < TestsTracker.testMethods.length; i++) {
            options[i] = this._testMethodOption(i);
        }
        return options.join('');
    }

    public html() {

        const testMethodOptions: string = this._getTestMethodOptions();
        const previousRuns: string = this._getPreviousRunsOptions();
    
        return `
            <select class="picker" id="testPicker">
                <option value="">No Method</option>
                <option value="???????????????????????????-" disabled="">??????????????? Live Tests ????????????-</option>
                ${testMethodOptions}
                <option value="???????????????????????????-" disabled="">??????????????? Previous Runs ????????????-</option>
                ${previousRuns}
            </select>`;
    }

}
