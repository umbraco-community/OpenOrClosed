export const manifests: Array<UmbExtensionManifest> = [
    {
        type: 'propertyEditorUi',
        alias: 'OpenOrClosed.PropertyEditorUi.WeeklyHours',
        name: 'Weekly Hours Property Editor UI',
        element: () => import('./ooc-weekly-hours.element.js'),
        meta: {
            label: '#openOrClosed_weeklyHoursLabel',
            icon: 'icon-time',
            group: 'richContent',
            propertyEditorSchemaAlias: 'OpenOrClosed.WeeklyHours',
            settings: {
                properties: [
                    {
                        alias: 'time_24hr',
                        label: '#openOrClosed_settingTimeFormat',
                        description: '#openOrClosed_settingTimeFormatDescription',
                        propertyEditorUiAlias: 'Umb.PropertyEditorUi.Toggle',
                    },
                    {
                        alias: 'defaultOpen',
                        label: '#openOrClosed_settingDefaultOpen',
                        description: '#openOrClosed_settingDefaultOpenDescription',
                        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.TimeInput',
                    },
                    {
                        alias: 'defaultClose',
                        label: '#openOrClosed_settingDefaultClose',
                        description: '#openOrClosed_settingDefaultCloseDescription',
                        propertyEditorUiAlias: 'OpenOrClosed.PropertyEditorUi.TimeInput',
                    },
                    {
                        alias: 'showAppointmentOnly',
                        label: '#openOrClosed_settingAppointmentOnly',
                        description: '#openOrClosed_settingAppointmentOnlyDescription',
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
