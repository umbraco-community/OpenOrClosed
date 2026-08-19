export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'propertyEditorUi',
        alias: 'OpenOrClosed.PropertyEditorUi.WeeklyHours',
        name: 'Weekly Hours Property Editor UI',
        element: () => import('./ooc-weekly-hours.element.js'),
        meta: {
            label: 'Weekly Hours',
            icon: 'icon-time',
            group: 'richContent',
            propertyEditorSchemaAlias: 'OpenOrClosed.WeeklyHours',
            settings: {
                properties: [
                    {
                        alias: 'time_24hr',
                        label: 'Time Format',
                        description: '12/24 hour clock',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'defaultOpen',
                        label: 'Default Open Time',
                        description: 'Start time for a newly added set of hours - defaults to 09:00',
                        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.TimeInput',
                    },
                    {
                        alias: 'defaultClose',
                        label: 'Default Close Time',
                        description: 'End time for a newly added set of hours - defaults to 17:00',
                        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.TimeInput',
                    },
                    {
                        alias: 'showAppointmentOnly',
                        label: 'Enable Appointment Only?',
                        description: 'Show the appointment only option for a set of hours',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                ],
                defaultData: [
                    { alias: 'time_24hr', value: true },
                    { alias: 'defaultOpen', value: '09:00' },
                    { alias: 'defaultClose', value: '17:00' },
                    { alias: 'showAppointmentOnly', value: false },
                ],
            },
        },
    },
];
