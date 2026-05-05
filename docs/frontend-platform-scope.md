# Padel Platform Frontend Scope

## Purpose

The web platform should help players discover, evaluate, and compare padel rackets using a clear, trustworthy, and easy-to-scan interface. The frontend should transform the racket database into a useful decision-making experience: users should be able to search for a racket, understand its playing profile, inspect its technical specifications, and compare multiple rackets before choosing the best option for their needs.

This document describes only the frontend behavior and user experience. Backend crawling, data normalization, database updates, and scoring logic are outside this scope.

## Target Users

The frontend should serve players who want to choose a padel racket with confidence:

- Beginners looking for an easy, forgiving racket.
- Intermediate players comparing options by control, power, maneuverability, and sweet spot.
- Advanced players who already know brands or models and want fast, structured comparisons.
- Users who want to verify information across multiple padel sources before trusting a recommendation.

## Core Experience

The platform should open with a direct search experience. Users should immediately understand that they can search by racket name, brand, or model family, then browse matching rackets from the unified catalog.

Search results should be filterable and sortable. The interface should allow users to narrow the catalog by the most important frontend-facing attributes, including:

- Brand.
- Year.
- Shape.
- Balance.
- Player level.
- Overall score.
- Power.
- Control.
- Maneuverability.
- Sweet spot.
- Reliability score.

Results should be available in both compact list and visual card views. The list view should support faster scanning and comparison, while the card view should give more visual emphasis to racket images.

## Racket Detail Page

Each racket should have a dedicated detail page that presents the model as a complete product profile. The page should show:

- Racket image.
- Brand and model name.
- Year when available.
- Overall rating.
- Reliability score.
- Key performance metrics.
- Technical specifications.
- Source links used to build the unified profile.

The performance profile should be easy to understand visually. A radar chart or similar visual component should show the main playing characteristics:

- Power.
- Control.
- Maneuverability.
- Sweet spot.

The detail page should help users quickly answer:

- Is this racket more power-oriented or control-oriented?
- Is it easy to handle?
- Does it have a forgiving sweet spot?
- Is the available data reliable?
- Which sources contributed to this profile?

## Multi-Racket Comparison

The comparison between multiple rackets is an important part of the platform and should become a central frontend feature.

Users should be able to select multiple rackets from search results and add them to a comparison area. The comparison should make differences obvious without forcing the user to open several detail pages in separate tabs.

The comparison feature should support:

- Adding and removing rackets from the comparison.
- Comparing at least two rackets, with support for more than two when the layout allows it.
- A persistent comparison tray or button that shows how many rackets are selected.
- A dedicated comparison page or modal.
- Side-by-side comparison of images, names, brands, and years.
- Side-by-side comparison of scores and technical specifications.
- Visual highlighting of the strongest value for each metric.
- Clear handling of missing data.
- A quick way to reset the comparison.

The comparison view should include the most decision-relevant fields:

- Overall score.
- Power.
- Control.
- Maneuverability.
- Sweet spot.
- Reliability.
- Shape.
- Balance.
- Weight.
- Surface.
- Core material.
- Face material.
- Frame material.
- Player level.
- Feeling.

For performance metrics, the frontend should show both numbers and visual indicators, such as bars, mini radar charts, or highlighted table cells. The goal is to make tradeoffs visible: for example, one racket may offer more power while another offers better control or easier maneuverability.

## Recommended Frontend Pages

The platform should include these main frontend areas:

- Home and search page: the main entry point for finding rackets.
- Search results: filterable, sortable, and switchable between list and card views.
- Racket detail page: a full profile for a single racket.
- Comparison page or modal: a side-by-side view for selected rackets.
- Empty states: clear messages when searches return no results or selected comparison rackets are removed.
- Error states: graceful messages when data cannot be loaded.

## Interaction Requirements

The frontend should feel fast and direct. Users should be able to move from search to detail to comparison with minimal friction.

Important interactions:

- Search input with clear placeholder examples.
- Sort selector for key performance metrics.
- Filters using sliders, dropdowns, and toggles where appropriate.
- View switch between list and card results.
- Compare checkbox or button on every result item.
- Compare action on every racket detail page.
- Back navigation from detail pages to search results.
- Links to original sources opened in a new tab.

The selected comparison rackets should remain available while the user navigates between search results and detail pages. This can be handled in the frontend with URL state, local storage, or application state.

## Visual Direction

The design should be practical, sporty, and data-oriented. It should prioritize clarity over decoration.

The UI should:

- Make racket images prominent but not oversized.
- Use compact metric cards for fast scanning.
- Use charts and bars only when they help users compare values.
- Keep filters visible and easy to adjust on desktop.
- Provide a clean mobile layout where filters and comparison controls remain accessible.
- Clearly distinguish verified, reliable, incomplete, and missing data.

## Frontend Success Criteria

The frontend is successful when a user can:

- Search for a racket by name or brand.
- Understand the main strengths and weaknesses of a racket within seconds.
- Filter the catalog based on their playing preferences.
- Open a detailed product profile.
- Compare multiple rackets side by side.
- Decide which racket better matches their playing style.
- Trust the interface because sources and reliability are visible.

