# Changelog

This document tracks major product milestones, platform improvements, UI enhancements, and operational fixes delivered across the Uptime project.

---

## Release Summary

| Version | Release Date | Focus Area |
|---------|--------------|------------|
| 2.0.1 | 16 April 2026 | AI-powered observability and enterprise dashboard polish |
| 2.0.0 | 15 April 2026 | Incident workflow, Data Center stability, and UX refinement |
| 1.0.0 | 01 April 2026 | Initial platform foundation and core monitoring setup |

---

## Version 2.0.1
**Release Date:** 16 April 2026  
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Introduced a more professional, enterprise-ready Observability dashboard.
- Added a full-width AI Insight experience with improved visual hierarchy and better executive readability.
- Added structured observability sections for signal breakdown, source health, and issue prioritization.
- Added a formal changelog document to support ongoing release tracking.

### What's Changed
- Refined the Observability page to align with the visual style of the Overview and Investigate screens.
- Improved card design, spacing, section order, and top-level dashboard presentation.
- Reworked AI summary rendering so headers, sections, and bullet points display in a clean readable format instead of raw text blocks.

### What's Fixed
- Corrected formatting issues in AI-generated summary content.
- Improved consistency across UI components to better match the product design language.
- Cleaned up page presentation for better executive review and operations visibility.

---

## Version 2.0.0
**Release Date:** 15 April 2026  
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Added a ServiceNow-style investigation workflow to the ticketing experience.
- Introduced ticket lifecycle states including In progress, ServiceNow, Canceled, Resolved, and Closed Un-resolved.
- Added persistent activity history and work-note tracking for investigation tickets.
- Added improved incident detail layout with workflow controls and activity stream visibility.

### What's Changed
- Redesigned the Investigate page into a more compact, professional ticket operations interface.
- Improved sidebar navigation behavior, default expansion states, text sizing, and section ordering.
- Enhanced the overall user experience for incident review and operational follow-up.

### What's Fixed
- Resolved Data Center update issues where edits were not reliably reflected in the UI and database.
- Fixed session/auth persistence problems that caused save actions to fail after backend restarts.
- Corrected resolved-ticket workflow behavior and improved data refresh reliability.

---

## Version 1.0.0
**Release Date:** 01 April 2026  
**Contributors:** Project Maintainer, GitHub Copilot

### What's New
- Established the initial Uptime platform foundation using React, TypeScript, Vite, Express, and MySQL.
- Added core monitoring pages and operational modules for Overview, Infrastructure, Inventory, Database, Agents, and Settings.
- Added backend monitoring APIs, database initialization scripts, and capture/agent utilities for infrastructure visibility.
- Introduced the baseline UI framework and component library for consistent application design.

### What's Changed
- Built the first navigation structure and application shell for day-to-day operational workflows.
- Set up periodic health and monitoring collection patterns across platform services.
- Defined the base architecture used for later enterprise dashboards and incident workflows.

### What's Fixed
- Initial release focused on foundation delivery and core platform readiness.

---

## Notes
- This file should be updated for every notable feature release, UI refresh, workflow enhancement, or bug fix.
- Future entries should continue using the same format: Version, Release Date, What's New, What's Changed, What's Fixed, and Contributors.
