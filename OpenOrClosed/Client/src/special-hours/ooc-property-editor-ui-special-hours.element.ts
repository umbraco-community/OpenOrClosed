import { html, css, customElement } from '@umbraco-cms/backoffice/external/lit';
import { BusinessHoursBaseElement, type BaseDayInterface, type BaseHoursConfig } from '../shared/business-hours-base.element.js';
import { umbBindToValidation } from '@umbraco-cms/backoffice/validation';
import type { UmbPropertyEditorUiElement } from '@umbraco-cms/backoffice/property-editor';

interface SpecialDay extends BaseDayInterface {
    date: string | null;
}

interface SpecialHoursConfig extends BaseHoursConfig {
    defaultToClosed?: boolean;
    removeOldDates?: boolean;
    dateFormat?: string;
}

@customElement('ooc-property-editor-ui-special-hours')
export class OocPropertyEditorUiSpecialHoursElement extends BusinessHoursBaseElement<SpecialDay, SpecialHoursConfig> implements UmbPropertyEditorUiElement {

    protected _defaultConfig: SpecialHoursConfig = {
        excludeTimes: false,
        defaultToClosed: false,
        defaultOpen: "09:00",
        defaultClose: "17:00",
        showAppointmentOnly: false,
        removeOldDates: true,
        dateFormat: "YYYY-MM-DD",
        timeFormat: "HH:mm:ss",
        time_24hr: true,
        labelOpen: 'Open',
        labelClosed: 'Closed',
        hoursOptional: false,
        closedHoursOptional: false,
        hideCommentField: false,
        reversed: false
    };

    protected _mergeConfig() {
        super._mergeConfig();
        
        // Add special hours specific boolean props
        const specialBooleanProps = ['defaultToClosed', 'removeOldDates'];
        specialBooleanProps.forEach(prop => {
            if (typeof this._config[prop] === 'string') {
                this._config[prop] = this._config[prop] === '1' || this._config[prop] === 'true';
            }
        });
    }

    protected _initializeValue() {
        if (!this.value || !Array.isArray(this.value)) {
            this.value = [];
        }
        
        if (this._config.removeOldDates) {
            this._removeOldDates();
        }
        
        this._days = [...this.value];
        this.requestUpdate();
    }

    private _removeOldDates() {
        // Compare as plain calendar dates. `new Date('2026-08-19')` is parsed as UTC midnight, so
        // comparing it against a local Date drops today's entry in negative UTC offsets.
        const today = new Date();
        const currentDate = this._toDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());

        this.value = this.value.filter(day => {
            if (!day.date) return true;
            return this._dateKey(day.date) >= currentDate;
        });
    }

    /** `YYYY-MM-DD` from the stored value, ignoring any time or timezone that came with it. */
    private _dateKey(date: string): string {
        const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return match[0];

        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) return '';
        return this._toDateKey(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
    }

    private _toDateKey(year: number, month: number, day: number): string {
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    private _createSpecialDay(): SpecialDay {
        const isOpen = !this._config.defaultToClosed;
        return {
            date: null,
            isOpen: isOpen,
            openComment: '',
            closedComment: '',
            hoursOfBusiness: isOpen ? [this._createHours()] : []
        };
    }

    private _addSpecialDay() {
        const newDay = this._createSpecialDay();
        this._days = [...this._days, newDay];
        this._updateValue();
    }

    private _removeSpecialDay(index: number) {
        this._days = this._days.filter((_, i) => i !== index);
        this._updateValue();
    }

    private _updateDate(dayIndex: number, value: string) {
        const day = { ...this._days[dayIndex] };
        day.date = value;
        this._days = [...this._days];
        this._days[dayIndex] = day;
        this._updateValue();
    }

    protected _validateDay(day: SpecialDay, dayIndex: number): string[] {
        const errors = super._validateDay(day, dayIndex);
        
        // Special Hours specific validation: date is always required
        if (!day.date) {
            errors.push('Date is required for special hours');
        }
        
        return errors;
    }

    static styles = css`
        :host {
            display: block;
        }

        .special-day {
            border: 1px solid var(--uui-color-border);
            border-radius: var(--uui-border-radius);
            padding: var(--uui-size-space-4);
            margin-bottom: var(--uui-size-space-4);
        }

        .day-header {
            display: flex;
            align-items: center;
            gap: var(--uui-size-space-3);
            margin-bottom: var(--uui-size-space-3);
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
                    <div class="special-day">
                        <div class="day-header" id="day_${dayIndex}">
                            <div class="day-date">
                                    <uui-input
                                        type="date"
                                        .value=${day.date || ''}
                                        @input=${(e: Event) => this._updateDate(dayIndex, (e.target as HTMLInputElement).value)}
                                        placeholder="Select date"
                                        label="Select date"
                                        required
                                        ${umbBindToValidation(this, `date_${dayIndex}`)}>
                                    </uui-input>
                            </div>
                            
                            <uui-toggle
                                .checked=${this._isToggleChecked(day)}
                                @change=${() => this._toggleDayOpen(dayIndex)}
                                label="Toggle open/closed status">
                            </uui-toggle>
                            
                            <span class=${this._getDisplayClass(day)}>
                                ${this._getDisplayLabel(day)}
                            </span>
                            
                            <uui-button
                                look="secondary"
                                color="danger"
                                @click=${() => this._removeSpecialDay(dayIndex)}
                                label="Remove special date">
                                <uui-icon name="delete"></uui-icon>
                            </uui-button>
                            <uui-form-validation-message for="day_${dayIndex}">
                            </uui-form-validation-message>
                        </div>

                        ${this._renderDayErrors(day, dayIndex)}
                        ${this._renderClosedCommentField(day, dayIndex)}
                        ${this._renderHoursSection(day, dayIndex)}
                    </div>
                `)}
                
                <uui-button
                    look="secondary"
                    class="add-button"
                    @click=${this._addSpecialDay}
                    label="Add special date">
                    <uui-icon name="add"></uui-icon>
                    Add Special Date
                </uui-button>
            </div>
        `;
    }
}

export default OocPropertyEditorUiSpecialHoursElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-property-editor-ui-special-hours': OocPropertyEditorUiSpecialHoursElement;
    }
}