import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import type { OocCopyTargetsModalData, OocCopyTargetsModalValue } from './copy-targets.token.js';

/**
 * Picks where a row's hours should be copied. Generic over what a target is, so the weekly editor
 * can pass days and the holidays editor can pass holidays.
 *
 * It knows nothing about copying: it returns ids and the caller does the work.
 */
@customElement('ooc-copy-targets-modal')
export class OocCopyTargetsModalElement extends UmbModalBaseElement<
    OocCopyTargetsModalData,
    OocCopyTargetsModalValue
> {
    @state()
    private _selected: string[] = [];

    private _toggle(id: string) {
        this._selected = this._selected.includes(id)
            ? this._selected.filter((entry) => entry !== id)
            : [...this._selected, id];
    }

    /** Additive, not a mode - see OocCopyTargetsModalData.groups. */
    private _selectGroup(ids: string[]) {
        this._selected = [...new Set([...this._selected, ...ids])];
    }

    private _copy() {
        this.updateValue({ ids: this._selected });
        this._submitModal();
    }

    static styles = css`
        .hint {
            margin-bottom: var(--uui-size-space-4);
            color: var(--uui-color-text-alt);
            font-size: var(--uui-type-small-size);
        }
        .groups {
            display: flex;
            flex-wrap: wrap;
            gap: var(--uui-size-space-2);
            margin-bottom: var(--uui-size-space-4);
        }
        .target {
            margin-bottom: var(--uui-size-space-2);
        }
        .occupied {
            margin-left: var(--uui-size-space-2);
            color: var(--uui-color-text-alt);
            font-size: var(--uui-type-small-size);
        }
    `;

    private _renderGroups() {
        const groups = this.data?.groups ?? [];
        if (groups.length === 0) return '';

        return html`<div class="groups">
            ${groups.map(
                (group) => html`<uui-button
                    look="secondary"
                    compact
                    label=${group.label}
                    @click=${() => this._selectGroup(group.ids)}>
                    ${group.label}
                </uui-button>`,
            )}
        </div>`;
    }

    render() {
        const targets = this.data?.targets ?? [];

        return html`
            <umb-body-layout
                headline=${this.localize.term(
                    'openOrClosed_copyHoursFrom',
                    this.data?.sourceLabel ?? '',
                )}>
                <uui-box>
                    ${targets.length === 0
                        ? html`<div class="hint">
                              ${this.localize.term('openOrClosed_copyTargetsEmpty')}
                          </div>`
                        : html`
                              <div class="hint">
                                  ${this.localize.term('openOrClosed_copyTargetsHint')}
                              </div>
                              ${this._renderGroups()}
                              ${targets.map(
                                  (target) => html`<div class="target">
                                      <uui-checkbox
                                          label=${target.label}
                                          .checked=${this._selected.includes(target.id)}
                                          @change=${() => this._toggle(target.id)}>
                                          ${target.label}
                                      </uui-checkbox>
                                      ${target.occupied
                                          ? html`<span class="occupied"
                                                >${this.localize.term(
                                                    'openOrClosed_copyTargetsOccupied',
                                                )}</span
                                            >`
                                          : ''}
                                  </div>`,
                              )}
                          `}
                </uui-box>

                <uui-button
                    slot="actions"
                    look="secondary"
                    label=${this.localize.term('general_cancel')}
                    @click=${() => this._rejectModal()}>
                    ${this.localize.term('general_cancel')}
                </uui-button>
                <uui-button
                    slot="actions"
                    look="primary"
                    color="positive"
                    ?disabled=${this._selected.length === 0}
                    label=${this.localize.term('openOrClosed_copyHoursAction')}
                    @click=${this._copy}>
                    ${this.localize.term('openOrClosed_copyHoursAction')}
                </uui-button>
            </umb-body-layout>
        `;
    }
}

export default OocCopyTargetsModalElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-copy-targets-modal': OocCopyTargetsModalElement;
    }
}
