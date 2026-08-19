import { html, css, customElement } from '@umbraco-cms/backoffice/external/lit';
import { BusinessHoursBaseElement, type BaseDayInterface, type BaseHoursConfig } from '../shared/business-hours-base.element.js';
import type { UmbPropertyEditorUiElement } from '@umbraco-cms/backoffice/property-editor';

interface StandardDay extends BaseDayInterface {
    dayoftheweek: string;
    day: number | null; // DayOfWeek enum value (0=Sunday, 1=Monday, etc.) or null for holidays
}

interface StandardHoursConfig extends BaseHoursConfig {
    showBankHolidays?: boolean;
    labelBankHolidays?: string;
}

@customElement('ooc-property-editor-ui-standard-hours')
export class OocPropertyEditorUiStandardHoursElement extends BusinessHoursBaseElement<StandardDay, StandardHoursConfig> implements UmbPropertyEditorUiElement {

    protected _defaultConfig: StandardHoursConfig = {
        excludeTimes: false,
        defaultOpen: "09:00",
        defaultClose: "17:00",
        showAppointmentOnly: false,
        showBankHolidays: false,
        timeFormat: "HH:mm:ss",
        time_24hr: true,
        labelOpen: 'Open',
        labelClosed: 'Closed',
        labelBankHolidays: 'Bank Holidays',
        hoursOptional: false,
        closedHoursOptional: false,
        hideCommentField: false,
        reversed: false
    };

    private _dayLabels = [
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Bank Holidays'
    ];

    protected _mergeConfig() {
        super._mergeConfig();
        
        // Add standard hours specific boolean props
        const standardBooleanProps = ['showBankHolidays'];
        standardBooleanProps.forEach(prop => {
            if (typeof this._config[prop] === 'string') {
                this._config[prop] = this._config[prop] === '1' || this._config[prop] === 'true';
            }
        });
    }

    protected _initializeValue() {
        const dotwLength = this._config.showBankHolidays ? 8 : 7;
        
        if (!this.value || !Array.isArray(this.value)) {
            const newValue = [];
            for (let i = 0; i < dotwLength; i++) {
                newValue.push(this._createDay(i));
            }
            this.value = newValue;
        } else {
            // Adjust array size based on showBankHolidays config
            if (!this._config.showBankHolidays && this.value.length === 8) {
                this.value = [...this.value.slice(0, 7)];
            } else if (this._config.showBankHolidays && this.value.length === 7) {
                this.value = [...this.value, this._createDay(7)];
            }
        }

        // Fix up bank holiday label from config
        if (this._config.showBankHolidays && this.value[7]) {
            const updatedValue = [...this.value];
            updatedValue[7] = { ...updatedValue[7], dayoftheweek: this._config.labelBankHolidays || 'Bank Holidays' };
            this.value = updatedValue;
        }
        
        this._days = [...this.value];
        this.requestUpdate();
    }

    private _createDay(index: number): StandardDay {
        // System.DayOfWeek starts on Sunday (0), while ours starts on Monday (1). In addition, we have "PublicHoliday".
        let day: number | null = index + 1;
        if (day === 7) day = 0; // Sunday
        else if (day === 8) {
            day = null; // Holidays
        }
        
        return {
            dayoftheweek: this._dayLabels[index],
            day: day,
            isOpen: false,
            openComment: '',
            closedComment: '',
            hoursOfBusiness: []
        };
    }




    static styles = css`
        :host {
            display: block;
        }

        .standard-day {
            border: 1px solid var(--uui-color-border);
            border-radius: var(--uui-border-radius);
            padding: var(--uui-size-space-4);
            margin-bottom: var(--uui-size-space-3);
        }

        .day-header {
            display: flex;
            align-items: center;
            gap: var(--uui-size-space-3);
            margin-bottom: var(--uui-size-space-3);
        }

        .day-label {
            min-width: 120px;
            font-weight: bold;
        }

        .day-status {
            display: flex;
            align-items: center;
            gap: var(--uui-size-space-2);
        }

        .hours-section {
            margin-left: var(--uui-size-space-6);
        }

        .hours-row {
            display: flex;
            align-items: center;
            gap: var(--uui-size-space-3);
            margin-bottom: var(--uui-size-space-3);
        }

        .time-range {
            display: flex;
            align-items: center;
            gap: var(--uui-size-space-2);
        }

        .hours-open {
            color: var(--uui-color-positive);
        }

        .hours-closed {
            color: var(--uui-color-danger);
        }

        .comment-field {
            width: 100%;
            margin-top: var(--uui-size-space-2);
        }

        .add-button {
            margin-top: var(--uui-size-space-4);
        }

        .day-errors {
            margin-bottom: var(--uui-size-space-2);
        }

        .day-error {
            color: var(--uui-color-danger);
            font-size: var(--uui-type-small-size);
        }
    `;

    render() {
        return html`
            <div>
                ${this._days.map((day, dayIndex) => html`
                    <div class="standard-day">
                        <div class="day-header">
                            <div class="day-label">
                                ${day.dayoftheweek}
                            </div>
                            
                            <div class="day-status">
                                <uui-toggle
                                    .checked=${this._isToggleChecked(day)}
                                    @change=${() => this._toggleDayOpen(dayIndex)}
                                    label="Toggle ${day.dayoftheweek} open/closed">
                                </uui-toggle>
                                <span class=${this._getDisplayClass(day)}>
                                    ${this._getDisplayLabel(day)}
                                </span>
                            </div>
                        </div>

                        ${this._renderDayErrors(day, dayIndex)}
                        ${this._renderClosedCommentField(day, dayIndex)}
                        ${this._renderHoursSection(day, dayIndex)}
                    </div>
                `)}
            </div>
        `;
    }
}

export default OocPropertyEditorUiStandardHoursElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-property-editor-ui-standard-hours': OocPropertyEditorUiStandardHoursElement;
    }
}