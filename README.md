# Open or Closed for Umbraco

![Open or Closed Logo](https://raw.githubusercontent.com/umbraco-community/OpenOrClosed/master/GithubFiles/Logo/OpenOrClosed_logo.png)

Yet another Business Hours package for Umbraco

[![OpenOrClosed - CI](https://github.com/umbraco-community/OpenOrClosed/actions/workflows/build.yml/badge.svg)](https://github.com/umbraco-community/OpenOrClosed/actions/workflows/build.yml)
[![OpenOrClosed - Release](https://github.com/umbraco-community/OpenOrClosed/actions/workflows/release.yml/badge.svg)](https://github.com/umbraco-community/OpenOrClosed/actions/workflows/release.yml)

Nuget Packages:

| Package | Version | Downloads |
| -- | -- | -- |
| OpenOrClosed | [![NuGet release](https://img.shields.io/nuget/v/OpenOrClosed.svg)](https://www.nuget.org/packages/OpenOrClosed/) | [![NuGet release](https://img.shields.io/nuget/dt/OpenOrClosed.svg)](https://www.nuget.org/packages/OpenOrClosed/) |

Umbraco Package: [![Our Umbraco project page](https://img.shields.io/badge/umbraco-marketplace-green.svg)](https://marketplace.umbraco.com/package/openorclosed)

Adds Property Editors to manage standard and special (read holiday) opening/closing times

The OpenOrClosed nuget package can be used in Core projects to add support for ModelsBuilder generated Content Models.

## Property Editors

### Standard Business Hours

Monday through to Sunday and optionally Bank Holidays, set each day Open or Closed with multiple ranges of times.  Each time range can be flagged with "By Appointment".

### Special Business Hours

Adds the ability to specify specific dates, with the same set of features for Standard Business Hours.

## Change Log

### Version 17.1.2

* **Breaking Change:** Moved business logic back into main OpenOrClosed website - remove references to `OpenOrClosed.Core` and replace with `OpenOrClosed` nuget package where necessary.  Make sure you clean out obj/bin directories and rebuild.
* Fixed issues with static assets not available on Windows dev environments

### Version 17.1.0

**Breaking Change:** Models are now back in the `OpenOrClosed.Core` namespace (and nuget package), leaving the OpenOrClosed nuget package to mainly deliver the UI.

### Version 17

Updated for Umbraco 17

### Version 16

Completely re-built for Umbraco 16

* Improved validation
* Improved layout, including native time and date controls

### Version 2.0.6

UI Improvements and the ability to reverse open/closed status.

### Version 2.0.5

Special thanks to [Lasse Dollis Spilling](https://github.com/lassespilling) for his Comments contribution and cleanup

* Adds comments for each entry in Standard and Special Hours
* Added option to have all hours optional optional, not just closing hours.
* Fixed bug on updating Time pickers
* Cleaned up layout

### Version 2.0.1

* Standard Hours now reflect the current week for the OpensAt and ClosesAt lists

### Version 2.0.0

* Supports Umbraco 10+ only - for Umbraco 8 or 9 install version 1.1.0
* Hours are now optional, allowing for a Days Open/Closed facility without the need to specify times.
* Special Days can now be default to closed when added.
* System.DayOfWeek is now included in the StandardHours View Model, assisting with the ability to render a localised Day.

### Version 1.1.0

* Closed Times can now be made optional by configuration (breaking change)

### Version 1.0.0

* Supports Umbraco 8+

### Version 0.2.2 ***Potential BREAKING Change***

* Changes the Hours from string to DateTime in the View Model to enable better localisation support.

### Version 0.2.1

* Removes the Id property from the View Models since it's no longer populated anyway.

### Version 0.2.0

* Removes the Id property from the editor as it's redundant

## Logo

The package logo uses the "open hours" (by Gregor Cesnar) icon from the Noun Project, licensed under CC BY 3.0 US.
