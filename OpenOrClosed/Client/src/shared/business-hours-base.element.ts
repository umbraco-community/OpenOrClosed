import { UmbElementMixin } from '@umbraco-cms/backoffice/element-api';
import { umbBindToValidation } from '@umbraco-cms/backoffice/validation';
import { html, LitElement, property, state } from '@umbraco-cms/backoffice/external/lit';

export interface HoursOfBusiness {
    opensAt: string | null;
    closesAt: string | null;
    comment: string;
    byAppointmentOnly?: boolean;
}

export interface BaseHoursConfig {
    excludeTimes?: boolean;
    defaultOpen?: string;
    defaultClose?: string;
    showAppointmentOnly?: boolean;
    timeFormat?: string;
    time_24hr?: boolean;
    labelOpen?: string;
    labelClosed?: string;
    hoursOptional?: boolean;
    closedHoursOptional?: boolean;
    hideCommentField?: boolean;
    reversed?: boolean;
    [key: string]: any;
}

export interface BaseDayInterface {
    isOpen: boolean;
    openComment: string;
    closedComment: string;
    hoursOfBusiness: HoursOfBusiness[];
}

export abstract class BusinessHoursBaseElement<T extends BaseDayInterface, C extends BaseHoursConfig> extends UmbElementMixin(LitElement) {
    
    @property({ type: Array })
    value: T[] = [];

    @property({ type: Object })
    config?: any;

    @property({ type: Boolean })
    mandatory?: boolean;

    @property({ type: String })
    mandatoryMessage?: string;

    @state()
    protected _config: C = {} as C;

    @state()
    protected _days: T[] = [];


    protected abstract _defaultConfig: C;

    
    connectedCallback() {
        super.connectedCallback();
        this._mergeConfig();
        this._initializeValue();
    }

    // The workspace can hand us `value` and `config` after we are connected (async load, variant
    // switch), so re-read them whenever they change rather than only once on connect.
    protected willUpdate(changedProperties: Map<string, unknown>) {
        super.willUpdate(changedProperties);

        if (changedProperties.has('config')) {
            this._mergeConfig();
        }

        if (changedProperties.has('config') || (changedProperties.has('value') && !this._valueMatchesDays())) {
            this._initializeValue();
        }
    }

    /** True when `value` is already what we last wrote out, so an incoming update is our own echo. */
    private _valueMatchesDays(): boolean {
        return JSON.stringify(this.value ?? null) === JSON.stringify(this._days ?? null);
    }

    protected _mergeConfig() {
        // Start with defaults
        const mergedConfig = { ...this._defaultConfig };
        
        // Convert Umbraco's array config format to object
        if (this.config && Array.isArray(this.config)) {
            this.config.forEach((item: any) => {
                if (item.alias && item.hasOwnProperty('value')) {
                    (mergedConfig as any)[item.alias] = item.value;
                }
            });
        } else if (this.config) {
            // Handle direct object format (fallback)
            Object.assign(mergedConfig, this.config);
        }
        
        // Convert string booleans to actual booleans
        const booleanProps = ['excludeTimes', 'time_24hr', 'showAppointmentOnly', 'reversed', 'hoursOptional', 'closedHoursOptional', 'hideCommentField'];
        booleanProps.forEach(prop => {
            if (typeof (mergedConfig as any)[prop] === 'string') {
                (mergedConfig as any)[prop] = (mergedConfig as any)[prop] === '1' || (mergedConfig as any)[prop] === 'true';
            }
        });
        
        this._config = mergedConfig;
    }

    protected abstract _initializeValue(): void;

    // Helper methods for reversed logic
    protected _getEffectiveIsOpen(day: T): boolean {
        return this._config.reversed ? !day.isOpen : day.isOpen;
    }

    protected _getDisplayLabel(day: T): string {
        const effectiveIsOpen = this._getEffectiveIsOpen(day);
        return effectiveIsOpen ? (this._config.labelOpen || 'Open') : (this._config.labelClosed || 'Closed');
    }

    /** The value the on/off toggle should show - `reversed` flips it relative to the stored flag. */
    protected _isToggleChecked(day: T): boolean {
        return this._getEffectiveIsOpen(day);
    }

    protected _getDisplayClass(day: T): string {
        const effectiveIsOpen = this._getEffectiveIsOpen(day);
        return effectiveIsOpen ? 'hours-open' : 'hours-closed';
    }

    protected _validateDay(day: T, _dayIndex: number): string[] {
        const errors: string[] = [];
        
        // Use effective open state (accounting for reversed setting)
        const effectiveIsOpen = this._getEffectiveIsOpen(day);
        
        if (effectiveIsOpen) {
            // If times are not excluded, validate time fields
            if (!this._config.excludeTimes && !this._config.hoursOptional) {
                if (day.hoursOfBusiness.length === 0) {
                    errors.push('At least one set of hours is required when open');
                } else {
                    day.hoursOfBusiness.forEach((hours, hoursIndex) => {
                        if (!hours.opensAt) {
                            errors.push(`Open time is required for hours ${hoursIndex + 1}`);
                        }
                        if (!hours.closesAt && !this._config.closedHoursOptional) {
                            errors.push(`Close time is required for hours ${hoursIndex + 1}`);
                        }
                        
                        // Validate that end time is greater than start time
                        if (hours.opensAt && hours.closesAt) {
                            if (!this._isTimeAfter(hours.closesAt, hours.opensAt)) {
                                errors.push(`Close time must be after open time for hours ${hoursIndex + 1}`);
                            }
                        }
                    });
                }
            }
        }
        
        return errors;
    }


    // Method to validate individual time fields for UI validation
    protected _validateTimeField(dayIndex: number, hoursIndex: number, field: 'opensAt' | 'closesAt'): string | null {
        const day = this._days[dayIndex];
        const hours = day?.hoursOfBusiness[hoursIndex];
        
        if (!hours) return null;
        
        // Validate end time is after start time
        if (field === 'closesAt' && hours.opensAt && hours.closesAt) {
            if (!this._isTimeAfter(hours.closesAt, hours.opensAt)) {
                return 'End time must be after start time';
            }
        }
        
        return null; // No error
    }

    protected _hasValidationError(dayIndex: number, hoursIndex: number, field: 'opensAt' | 'closesAt'): boolean {
        return !!this._validateTimeField(dayIndex, hoursIndex, field);
    }

    protected _createHours(): HoursOfBusiness {
        const formatTime = (time: string | undefined) => {
            if (!time) return null;
            // Ensure time is in HH:mm:ss format
            return time.includes(':') && time.split(':').length === 2 ? `${time}:00` : time;
        };

        return {
            opensAt: !this._config.excludeTimes && this._config.defaultOpen ? formatTime(this._config.defaultOpen) : null,
            closesAt: !this._config.excludeTimes && this._config.defaultClose ? formatTime(this._config.defaultClose) : null,
            comment: '',
            byAppointmentOnly: false
        };
    }

    protected _updateValue() {
        this.value = [...this._days];
        // Dispatch Umbraco property value change event
        this.dispatchEvent(new CustomEvent('property-value-change', {
            detail: {
                value: this.value
            },
            bubbles: true,
            composed: true
        }));
        
        this.requestUpdate(); // Ensure UI updates to show validation states
    }

    /**
     * `<input type="time">` only ever accepts and reports a 24-hour `HH:mm[:ss]` value - whether it
     * is *presented* as 12-hour is up to the browser locale. Handing it "9:00 AM" makes it discard
     * the value and render blank, so both directions stay on the 24-hour wire format.
     */
    protected _formatTime(time: string | null): string {
        if (!time) return '';

        const [hours, minutes] = time.split(':');
        if (hours === undefined || minutes === undefined) return '';

        return `${hours.padStart(2, '0')}:${minutes}`;
    }


    protected _parseTimeInput(timeStr: string): string {
        if (!timeStr) return '';

        // The native control always reports 24-hour `HH:mm` (or `HH:mm:ss`); normalise to seconds.
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;

        const [hours, minutes, seconds = '00'] = parts;
        return `${hours.padStart(2, '0')}:${minutes}:${seconds.padStart(2, '0')}`;
    }

    protected _toggleDayOpen(index: number) {
        const day = { ...this._days[index] };
        day.isOpen = !day.isOpen;

        // Hours belong to the day as it is *displayed*, which `reversed` inverts.
        const effectiveIsOpen = this._getEffectiveIsOpen(day);
        if (effectiveIsOpen && day.hoursOfBusiness.length === 0) {
            day.hoursOfBusiness = [this._createHours()];
        } else if (!effectiveIsOpen) {
            day.hoursOfBusiness = [];
        }
        
        this._days = [...this._days];
        this._days[index] = day;
        this._updateValue();
    }

    protected _addHours(dayIndex: number) {
        if (!this._config.excludeTimes) {
            const day = { ...this._days[dayIndex] };
            const newHours = this._createSmartHours(day);
            day.hoursOfBusiness = [...day.hoursOfBusiness, newHours];
            this._days = [...this._days];
            this._days[dayIndex] = day;
            this._updateValue();
        }
    }

    protected _createSmartHours(day: T): HoursOfBusiness {
        // Create new hours starting with base creation
        const newHours = this._createHours();
        
        // If this is NOT the first set of hours, find the latest end time and set smart start time
        if (day.hoursOfBusiness.length > 0) {
            let latestEndTime: string | null = null;
            
            for (const hours of day.hoursOfBusiness) {
                if (hours.closesAt) {
                    if (!latestEndTime || hours.closesAt > latestEndTime) {
                        latestEndTime = hours.closesAt;
                    }
                }
            }
            
            if (latestEndTime) {
                // Add a small buffer (e.g., 1 minute) after the last end time
                const nextStartTime = this._addMinutesToTime(latestEndTime, 1);
                newHours.opensAt = nextStartTime;
                // For additional hours, calculate end time as start + 1 hour, rounded
                const rawEndTime = this._addMinutesToTime(nextStartTime, 60);
                newHours.closesAt = this._roundToNearest15Minutes(rawEndTime);
            }
        }
        // For the first set of hours, keep the configured default times (don't override)

        return newHours;
    }

    protected _removeHours(dayIndex: number, hoursIndex: number) {
        const day = { ...this._days[dayIndex] };
        day.hoursOfBusiness = day.hoursOfBusiness.filter((_, i) => i !== hoursIndex);
        
        if (!this._config.hoursOptional && day.hoursOfBusiness.length === 0) {
            day.isOpen = !!this._config.reversed;
        }
        
        this._days = [...this._days];
        this._days[dayIndex] = day;
        this._updateValue();
    }

    protected _updateTime(dayIndex: number, hoursIndex: number, field: 'opensAt' | 'closesAt', value: string) {
        const day = { ...this._days[dayIndex] };
        const hours = { ...day.hoursOfBusiness[hoursIndex] };

        hours[field] = value;
        
        // Auto-set end time if start time is being set and end time is empty
        if (field === 'opensAt' && value && !hours.closesAt) {
            // Set end time to 1 hour after start time with 15-minute rounding
            const rawEndTime = this._addMinutesToTime(value, 60);
            hours.closesAt = this._roundToNearest15Minutes(rawEndTime);
        }
        
        day.hoursOfBusiness = [...day.hoursOfBusiness];
        day.hoursOfBusiness[hoursIndex] = hours;
        this._days = [...this._days];
        this._days[dayIndex] = day;
        this._updateValue();
    }

    protected _updateComment(dayIndex: number, field: 'openComment' | 'closedComment', value: string) {
        const day = { ...this._days[dayIndex] };
        day[field] = value;
        this._days = [...this._days];
        this._days[dayIndex] = day;
        this._updateValue();
    }

    protected _updateHoursComment(dayIndex: number, hoursIndex: number, value: string) {
        const day = { ...this._days[dayIndex] };
        const hours = { ...day.hoursOfBusiness[hoursIndex] };
        hours.comment = value;
        day.hoursOfBusiness = [...day.hoursOfBusiness];
        day.hoursOfBusiness[hoursIndex] = hours;
        this._days = [...this._days];
        this._days[dayIndex] = day;
        this._updateValue();
    }

    protected _toggleAppointmentOnly(dayIndex: number, hoursIndex: number) {
        const day = { ...this._days[dayIndex] };
        const hours = { ...day.hoursOfBusiness[hoursIndex] };
        hours.byAppointmentOnly = !hours.byAppointmentOnly;
        day.hoursOfBusiness = [...day.hoursOfBusiness];
        day.hoursOfBusiness[hoursIndex] = hours;
        this._days = [...this._days];
        this._days[dayIndex] = day;
        this._updateValue();
    }

    protected _isTimeAfter(timeA: string, timeB: string): boolean {
        // Convert time strings to minutes for comparison
        const getMinutes = (timeStr: string): number => {
            const parts = timeStr.split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        };
        
        return getMinutes(timeA) > getMinutes(timeB);
    }


    protected _addMinutesToTime(timeString: string, minutes: number): string {
        // Parse time string (HH:mm:ss or HH:mm format)
        const parts = timeString.split(':');
        const hours = parseInt(parts[0]);
        const mins = parseInt(parts[1]);
        const secs = parts.length > 2 ? parseInt(parts[2]) : 0;

        // Create date object for easier manipulation
        const date = new Date();
        date.setHours(hours, mins + minutes, secs);

        // Format back to HH:mm:ss
        const newHours = date.getHours().toString().padStart(2, '0');
        const newMins = date.getMinutes().toString().padStart(2, '0');
        const newSecs = date.getSeconds().toString().padStart(2, '0');

        return `${newHours}:${newMins}:${newSecs}`;
    }

    protected _roundToNearest15Minutes(timeString: string): string {
        // Parse time string (HH:mm:ss or HH:mm format)
        const parts = timeString.split(':');
        const hours = parseInt(parts[0]);
        const mins = parseInt(parts[1]);

        // Round minutes to nearest 15 (0, 15, 30, 45)
        // If minutes are less than 8, round down; otherwise round to nearest 15
        const minutesFromQuarter = mins % 15;
        let roundedMins;
        if (minutesFromQuarter < 8) {
            roundedMins = mins - minutesFromQuarter; // Round down
        } else {
            roundedMins = mins + (15 - minutesFromQuarter); // Round up
        }
        
        // Create date object for handling hour overflow
        const date = new Date();
        date.setHours(hours, roundedMins, 0); // Set seconds to 0 for clean times

        // Format back to HH:mm:ss
        const newHours = date.getHours().toString().padStart(2, '0');
        const newMins = date.getMinutes().toString().padStart(2, '0');
        const newSecs = '00'; // Always set seconds to 00 for rounded times

        return `${newHours}:${newMins}:${newSecs}`;
    }

    protected _renderHoursSection(day: T, dayIndex: number) {
        const effectiveIsOpen = this._getEffectiveIsOpen(day);
        return html`
            ${effectiveIsOpen ? html`
                <div class="hours-section">
                    ${day.hoursOfBusiness.map((hours, hoursIndex) => html`
                        <div class="hours-row" id="hours-${dayIndex}-${hoursIndex}">
                            ${!this._config.excludeTimes ? html`
                                <div class="time-range">
                                        <uui-input
                                            type="time"
                                            .value=${this._formatTime(hours.opensAt)}
                                            @change=${(e: Event) => {
                                                const value = this._parseTimeInput((e.target as HTMLInputElement).value);
                                                this._updateTime(dayIndex, hoursIndex, 'opensAt', value);
                                            }}
                                            placeholder="Open time"
                                            label="Open time"
                                            ?required=${!this._config.excludeTimes && !this._config.hoursOptional}
                                            ${umbBindToValidation(this, `opensAt_${dayIndex}_${hoursIndex}`)}
                                        >
                                        </uui-input>
                                    <span>to</span>
                                        <uui-input
                                            type="time"
                                            .value=${this._formatTime(hours.closesAt)}
                                            @change=${(e: Event) => {
                                                const value = this._parseTimeInput((e.target as HTMLInputElement).value);
                                                this._updateTime(dayIndex, hoursIndex, 'closesAt', value);
                                            }}
                                            placeholder="Close time"
                                            label="Close time"
                                            ?error=${this._hasValidationError(dayIndex, hoursIndex, 'closesAt')}
                                            .errorMessage=${this._validateTimeField(dayIndex, hoursIndex, 'closesAt')}
                                            ?required=${!this._config.excludeTimes && !this._config.hoursOptional && !this._config.closedHoursOptional}
                                            ${umbBindToValidation(this, `closesAt_${dayIndex}_${hoursIndex}`)}
                                        >
                                        </uui-input>
                                </div>
                            ` : ''}
                            
                            ${this._config.showAppointmentOnly ? html`
                                    <uui-toggle
                                        .checked=${hours.byAppointmentOnly || false}
                                        @change=${() => this._toggleAppointmentOnly(dayIndex, hoursIndex)}>
                                        By appointment only
                                    </uui-toggle>
                            ` : ''}
                            
                            ${!this._config.excludeTimes ? html`
                                <uui-button
                                    look="secondary"
                                    color="danger"
                                    @click=${() => this._removeHours(dayIndex, hoursIndex)}
                                    label="Remove hours">
                                    <uui-icon name="delete"></uui-icon>
                                </uui-button>
                            ` : ''}
                            <uui-form-validation-message for="hours-${dayIndex}-${hoursIndex}">
                            </uui-form-validation-message>
                        </div>
                        
                        ${!this._config.hideCommentField && !this._config.excludeTimes ? html`
                            <uui-textarea
                                class="comment-field"
                                .value=${hours.comment}
                                @change=${(e: Event) => this._updateHoursComment(dayIndex, hoursIndex, (e.target as HTMLTextAreaElement).value)}
                                placeholder="Comment for these hours"
                                label="Comment for these hours">
                            </uui-textarea>
                        ` : ''}
                    `)}
                    
                    ${!this._config.hideCommentField && day.hoursOfBusiness.length === 0 ? html`
                        <uui-textarea
                            class="comment-field"
                            .value=${day.openComment}
                            @change=${(e: Event) => this._updateComment(dayIndex, 'openComment', (e.target as HTMLTextAreaElement).value)}
                            placeholder="Reason for being ${this._config.labelOpen || 'open'}"
                            label="Reason for being ${this._config.labelOpen || 'open'}">
                        </uui-textarea>
                    ` : ''}
                    
                    ${!this._config.excludeTimes ? html`
                        <uui-button
                            look="secondary"
                            class="add-button"
                            @click=${() => this._addHours(dayIndex)}
                            label="Add hours">
                            <uui-icon name="add"></uui-icon>
                            Add Hours
                        </uui-button>
                    ` : ''}
                </div>
            ` : ''}
        `;
    }

    /** Renders the validation messages for a day - `_validateDay` had no way of reaching the UI. */
    protected _renderDayErrors(day: T, dayIndex: number) {
        const errors = this._validateDay(day, dayIndex);
        if (errors.length === 0) return '';

        return html`
            <div class="day-errors">
                ${errors.map((error) => html`<div class="day-error">${error}</div>`)}
            </div>
        `;
    }

    protected _renderClosedCommentField(day: T, dayIndex: number) {
        const effectiveIsOpen = this._getEffectiveIsOpen(day);
        return html`
            ${!this._config.hideCommentField && !effectiveIsOpen ? html`
                <uui-textarea
                    class="comment-field"
                    .value=${day.closedComment}
                    @change=${(e: Event) => this._updateComment(dayIndex, 'closedComment', (e.target as HTMLTextAreaElement).value)}
                    placeholder="Reason for being ${this._config.labelClosed || 'closed'}"
                    label="Reason for being ${this._config.labelClosed || 'closed'}">
                </uui-textarea>
            ` : ''}
        `;
    }

}