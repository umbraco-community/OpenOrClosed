/**
 * The only place English lives. Keys are referenced as `openOrClosed_<key>`.
 *
 * Built-in Umbraco keys are used instead of duplicating them here: general_name,
 * general_cancel, general_remove, general_label, general_yes, general_no,
 * general_default, and buttons_save (there is no general_save).
 */
export default {
    openOrClosed: {
        // Property editor manifests
        weeklyHoursLabel: 'Weekly Hours',
        holidaysLabel: 'Holidays',
        presetHoursLabel: 'Preset Hours',

        // Data type settings
        settingTimeFormat: 'Time Format',
        settingTimeFormatDescription: '12/24 hour clock',
        settingDefaultOpen: 'Default Open Time',
        settingDefaultOpenDescription:
            'Start time for a newly added set of hours — defaults to 09:00',
        settingDefaultClose: 'Default Close Time',
        settingDefaultCloseDescription:
            'End time for a newly added set of hours — defaults to 17:00',
        settingAppointmentOnly: 'Enable Appointment Only?',
        settingAppointmentOnlyDescription: 'Show the appointment only option for a set of hours',
        settingRemoveExpired: 'Remove Expired Holidays?',
        settingRemoveExpiredDescription:
            'Hide finished holidays from the converted value and the Delivery API. They stay visible in this editor so a mistyped date can still be corrected.',
        settingPresetHours: 'Preset Hours',
        settingPresetHoursDescription:
            'Blocks of hours you can add to a day in one click. On Holidays this is a pattern held in the data type — not the Default holiday hours this node falls back to. Leave it empty to add hours one block at a time.',

        // Holidays editor
        defaultHolidayHours: 'Default holiday hours',
        noHolidaysYet: 'No holidays yet.',
        addHoliday: 'Add holiday',
        removeExpired: 'Remove expired',
        columnDates: 'Dates',
        columnYearly: 'Yearly',
        columnHours: 'Hours',
        expiredSuffix: '(Expired)',
        hoursClosed: 'Closed',
        hoursCustom: 'Custom',
        openHolidayAction: (name: string) => `Edit ${name || 'holiday'}`,

        // Holiday modal
        holiday: 'Holiday',
        fieldHours: 'Hours',
        startsOn: 'Starts on',
        endsOn: 'Ends on',
        repeatYearly: 'Repeat yearly',
        repeatYearlyHint: 'A repeating holiday never expires.',
        defaultHoursHint: (hours: string) => `Uses the default holiday hours: ${hours}.`,
        defaultHoursEmptyHint: 'No default holiday hours are set, so this holiday is closed.',

        // Range modal
        editHours: 'Edit hours',
        startsAt: 'Starts at',
        endsAt: 'Ends at',
        allDay: 'All day',
        labelOptional: '(optional)',
        byAppointmentOnly: 'By appointment only',

        // Copy targets modal
        copyHoursFrom: (source: string) => `Copy hours from ${source}`,
        copyTargetsHint: 'Choose where to copy them. Anything already there is replaced.',
        copyTargetsOccupied: 'has hours, will be replaced',
        copyTargetsEmpty: 'There is nowhere else to copy these hours to.',
        copyHoursAction: 'Copy hours',

        // Timeline accessible names
        byAppointmentOnlyShort: 'by appointment only',
        addPresetHours: (hours: string) => `Add ${hours}`,

        // Validation — one key per error code
        errorNameRequired: 'A name is required',
        errorStartDateInvalid: 'A valid start date is required',
        errorEndDateInvalid: 'A valid end date is required',
        errorEndBeforeStart: 'The end date must be on or after the start date',
        errorCustomNeedsHours: 'Custom hours need at least one set of hours',
        errorOutsideDay: 'Hours must fall within the day.',
        errorEndNotAfterStart: 'The end time must be after the start time.',
        errorTooShort: (minutes: number) => `Hours must be at least ${minutes} minutes long.`,
        errorOverlaps: 'These hours overlap another set on the same day.',
    },
};
