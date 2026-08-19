import {
    css,
    customElement,
    html,
    LitElement,
    property,
    state,
} from '@umbraco-cms/backoffice/external/lit';
import {
    createRange,
    DAY_MINUTES,
    DEFAULT_SNAP_MINUTES,
    formatRange,
    largestGap,
    moveRange,
    parseTime,
    resizeRange,
    type HoursRange,
} from './time-range.js';

/**
 * One 00:00-24:00 track carrying any number of non-overlapping ranges.
 *
 * Knows nothing about days, holidays or Umbraco, so the weekly editor, the holidays default track
 * and the per-holiday track can all use it unchanged.
 */
@customElement('ooc-timeline')
export class OocTimelineElement extends LitElement {
    @property({ type: Array })
    ranges: HoursRange[] = [];

    @property({ type: Number })
    snapMinutes = DEFAULT_SNAP_MINUTES;

    @property({ type: Boolean })
    use24Hour = true;

    @property({ type: Boolean })
    showAppointmentOnly = false;

    /** Prefixed onto every block's accessible name, e.g. "Monday". */
    @property({ type: String })
    trackLabel = '';

    /** How long a range created by clicking empty track should be. */
    @property({ type: Number })
    defaultDurationMinutes = 8 * 60;

    @state()
    private _announcement = '';

    /** Which block is mid-drag. Pointer capture drops :hover, so the grips need this to stay visible. */
    @state()
    private _dragIndex: number | null = null;

    #drag: { index: number; mode: 'start' | 'end' | 'move'; grabOffset: number } | null = null;

    /** A drag ends with a click. Without this, letting go would also open the dialog. */
    #dragged = false;

    protected _percent(minutes: number): number {
        return (minutes / DAY_MINUTES) * 100;
    }

    protected _accessibleName(range: HoursRange): string {
        const parts = [this.trackLabel, formatRange(range, this.use24Hour)];
        if (range.label) parts.push(range.label);
        if (range.byAppointmentOnly) parts.push('by appointment only');
        return parts.filter(Boolean).join(', ');
    }

    /** Turns a pointer position into minutes since midnight. */
    #minutesFromEvent(event: PointerEvent): number {
        const track = this.renderRoot.querySelector('.track') as HTMLElement;
        const bounds = track.getBoundingClientRect();
        const ratio = (event.clientX - bounds.left) / bounds.width;
        return Math.min(DAY_MINUTES, Math.max(0, Math.round(ratio * DAY_MINUTES)));
    }

    private _startDrag(event: PointerEvent, index: number, mode: 'start' | 'end' | 'move') {
        event.preventDefault();
        event.stopPropagation();

        const minutes = this.#minutesFromEvent(event);
        this.#dragged = false;
        this._dragIndex = index;
        this.#drag = {
            index,
            mode,
            grabOffset: mode === 'move' ? minutes - parseTime(this.ranges[index].start) : 0,
        };

        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        this.addEventListener('pointermove', this._onDragMove);
        this.addEventListener('pointerup', this._endDrag);
        this.addEventListener('pointercancel', this._endDrag);
    }

    private _onDragMove = (event: PointerEvent) => {
        if (!this.#drag) return;

        const { index, mode, grabOffset } = this.#drag;
        const minutes = this.#minutesFromEvent(event);
        this.#dragged = true;

        // Every one of these clamps against the neighbours, so an overlap cannot be dragged into being.
        const updated =
            mode === 'move'
                ? moveRange(this.ranges, index, minutes - grabOffset, this.snapMinutes)
                : resizeRange(this.ranges, index, mode, minutes, this.snapMinutes);

        this._commit(updated, index);
    };

    private _endDrag = () => {
        this.#drag = null;
        this._dragIndex = null;
        this.removeEventListener('pointermove', this._onDragMove);
        this.removeEventListener('pointerup', this._endDrag);
        this.removeEventListener('pointercancel', this._endDrag);
    };

    private _onTrackPointerDown = (event: PointerEvent) => {
        if (event.target !== event.currentTarget) return;

        const created = createRange(
            this.ranges,
            this.#minutesFromEvent(event),
            this.defaultDurationMinutes,
            this.snapMinutes,
        );

        if (created) this._commit(created);
    };

    private _onTrackKeydown = (event: KeyboardEvent) => {
        if (event.target !== event.currentTarget || event.key !== 'Enter') return;

        const gap = largestGap(this.ranges);
        if (!gap) return;

        event.preventDefault();
        const created = createRange(this.ranges, gap.start, this.defaultDurationMinutes, this.snapMinutes);
        if (created) this._commit(created);
    };

    private _onBlockKeydown(event: KeyboardEvent, index: number) {
        const step = this.snapMinutes;
        const range = this.ranges[index];

        switch (event.key) {
            case 'Enter':
            case ' ':
                event.preventDefault();
                this._emitEdit(index);
                return;

            case 'Delete':
            case 'Backspace':
                event.preventDefault();
                this._commit(this.ranges.filter((_, i) => i !== index));
                return;

            case 'ArrowLeft':
            case 'ArrowRight': {
                event.preventDefault();
                const direction = event.key === 'ArrowLeft' ? -step : step;

                const updated = event.shiftKey
                    ? resizeRange(this.ranges, index, 'end', parseTime(range.end) + direction, this.snapMinutes)
                    : moveRange(this.ranges, index, parseTime(range.start) + direction, this.snapMinutes);

                this._commit(updated, index);
                return;
            }

            default:
                return;
        }
    }

    private _emitEdit(index: number) {
        if (this.#dragged) {
            this.#dragged = false;
            return;
        }

        this.dispatchEvent(new CustomEvent('edit-range', { detail: { index }, bubbles: true, composed: true }));
    }

    /** Publishes a new set of ranges and announces the change for screen readers. */
    private _commit(ranges: HoursRange[], announceIndex?: number) {
        this.ranges = ranges;

        if (announceIndex !== undefined && ranges[announceIndex]) {
            this._announcement = formatRange(ranges[announceIndex], this.use24Hour);
        }

        this.dispatchEvent(new CustomEvent('change', { detail: { ranges } }));
    }

    static styles = css`
        :host {
            display: block;
        }

        .track {
            position: relative;
            height: 40px;
            cursor: pointer;
            border: 1px solid var(--uui-color-border);
            border-radius: var(--uui-border-radius);
            background: var(--uui-color-surface);
        }

        .track:focus-visible {
            outline: 2px solid var(--uui-color-focus);
            outline-offset: 1px;
        }

        .divider {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 1px;
            background: var(--uui-color-border);
        }

        .block {
            position: absolute;
            top: 3px;
            bottom: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 0 4px;
            border: 1px solid var(--uui-color-selected);
            border-radius: var(--uui-border-radius);
            background: var(--uui-color-surface-alt);
            color: var(--uui-color-selected);
            font-size: var(--uui-type-small-size);
            white-space: nowrap;
            overflow: hidden;
            cursor: pointer;
        }

        .block:focus-visible {
            outline: 2px solid var(--uui-color-focus);
            outline-offset: 1px;
        }

        .block .times {
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* The strip stays the hit area; min() shrinks it on short ranges so the middle is still grabbable. */
        .grip {
            position: absolute;
            top: 0;
            bottom: 0;
            width: min(7px, 30%);
            cursor: ew-resize;
        }

        .grip.start {
            left: 0;
        }

        .grip.end {
            right: 0;
        }

        /* Visual only - a hint that the edges resize. Keyboard resizing is Shift+Arrow on the block. */
        .grip::after {
            content: '';
            position: absolute;
            top: 2px;
            bottom: 2px;
            left: 50%;
            width: min(3px, 100%);
            transform: translateX(-50%);
            border-radius: 3px;
            background: var(--uui-color-selected);
            opacity: 0;
            transition: opacity 80ms ease-in-out;
        }

        .block:hover .grip::after,
        .block:focus-visible .grip::after,
        .block.dragging .grip::after {
            opacity: 0.6;
        }

        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip: rect(0 0 0 0);
            white-space: nowrap;
        }
    `;

    protected _renderBlock(range: HoursRange, index: number) {
        const start = parseTime(range.start);
        const end = parseTime(range.end);

        return html`
            <button
                type="button"
                class="block ${this._dragIndex === index ? 'dragging' : ''}"
                part="block"
                data-index=${index}
                style="left:${this._percent(start)}%;width:${this._percent(end - start)}%"
                aria-label=${this._accessibleName(range)}
                @pointerdown=${(e: PointerEvent) => this._startDrag(e, index, 'move')}
                @click=${() => this._emitEdit(index)}
                @keydown=${(e: KeyboardEvent) => this._onBlockKeydown(e, index)}>
                <i
                    class="grip start"
                    @pointerdown=${(e: PointerEvent) => this._startDrag(e, index, 'start')}></i>
                <i
                    class="grip end"
                    @pointerdown=${(e: PointerEvent) => this._startDrag(e, index, 'end')}></i>
                ${range.label ? html`<uui-icon name="icon-notepad" title=${range.label}></uui-icon>` : ''}
                ${this.showAppointmentOnly && range.byAppointmentOnly
                    ? html`<uui-icon name="icon-user" title="By appointment only"></uui-icon>`
                    : ''}
                <span class="times" title=${this._accessibleName(range)}
                    >${formatRange(range, this.use24Hour)}</span
                >
            </button>
        `;
    }

    render() {
        return html`
            <div
                class="track"
                part="track"
                tabindex="0"
                role="group"
                aria-label=${this.trackLabel}
                @pointerdown=${this._onTrackPointerDown}
                @keydown=${this._onTrackKeydown}>
                ${[6, 12, 18].map(
                    (hour) => html`<i class="divider" style="left:${this._percent(hour * 60)}%"></i>`,
                )}
                ${this.ranges.map((range, index) => this._renderBlock(range, index))}
            </div>
            <span class="sr-only" aria-live="polite">${this._announcement}</span>
        `;
    }
}

export default OocTimelineElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-timeline': OocTimelineElement;
    }
}
