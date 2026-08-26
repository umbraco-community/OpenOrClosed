/**
 * One clipboard entry value type per editor. The type string is the whole compatibility contract:
 * because Standard and Weekly hours do not share one, a weekly value can never reach a date-keyed
 * editor and no translator has to check for it.
 */
export const OOC_STANDARD_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE = 'openOrClosed.standardHours';
export const OOC_SPECIAL_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE = 'openOrClosed.specialHours';
export const OOC_WEEKLY_HOURS_CLIPBOARD_ENTRY_VALUE_TYPE = 'openOrClosed.weeklyHours';
export const OOC_HOLIDAYS_CLIPBOARD_ENTRY_VALUE_TYPE = 'openOrClosed.holidays';
