# UI/UX Rules for Badminton-App

This document is the project UI/UX rule set for Badminton-App. Use these principles when designing, reviewing, or implementing user-facing screens, forms, navigation, dashboards, loading states, errors, success states, and event-booking workflows.

Source guidance is derived from Laws of UX by Jon Yablonski: https://lawsofux.com/

## Core Project Rule

For every UI change in Badminton-App:

- Reduce cognitive load before adding visual complexity.
- Keep actions familiar, easy to find, and easy to tap.
- Provide clear feedback quickly, especially during auth, booking, scheduling, payment status, and admin actions.
- Make failures recoverable with visible, specific messages instead of indefinite loading.
- Prefer simple, conventional interaction patterns over clever or surprising ones.
- Use visual emphasis sparingly so the most important action or state is obvious.
- Design the end of each workflow carefully: users should know what happened and what to do next.

## Laws and Design Guidance

### Aesthetic-Usability Effect

Users often perceive aesthetically pleasing design as more usable.

- A polished interface can increase trust and tolerance for minor friction.
- Do not rely on aesthetics alone; the flow still needs to be clear, fast, and reliable.
- Pair visual polish with actual usability in forms, navigation, and feedback states.

### Choice Overload

People get overwhelmed when presented with too many options.

- Prioritize the most likely action or default.
- Use filters, search, or grouping when lists grow.
- Avoid showing too many competing actions on one screen.

### Chunking

Break information into meaningful groups.

- Group related fields, controls, and event details together.
- Use clear hierarchy and spacing so users can scan quickly.
- Keep admin forms and event cards modular.

### Cognitive Load

Cognitive load is the mental effort required to understand and use an interface.

- Remove unnecessary elements and unclear labels.
- Prefer sensible defaults and progressive disclosure.
- Keep each screen focused on the user task.

### Doherty Threshold

Users stay productive when the interface responds quickly.

- Show feedback within 400 ms where possible.
- Use loading states, skeletons, or progress indicators for longer work.
- Never leave users in an indefinite spinner state; show an error or timeout when something fails.

### Fitts's Law

The time to select a target depends on its size and distance.

- Make touch targets large enough for mobile use.
- Keep important actions near the relevant context.
- Use enough spacing to prevent accidental taps.

### Hick's Law

Decision time increases with the number and complexity of choices.

- Keep choices meaningful but limited.
- Break complex tasks into smaller steps.
- Highlight recommended or primary actions.

### Jakob's Law

Users prefer products that behave like other products they already know.

- Follow familiar patterns for login, forms, cards, navigation, and settings.
- Avoid surprising behavior unless there is a strong reason.
- Use conventional labels for common actions.

### Law of Common Region

Elements inside a clear boundary are perceived as related.

- Use containers, backgrounds, borders, or spacing to group related content.
- Keep event details, booking controls, and admin tools in distinct regions.

### Law of Proximity

Objects near each other are perceived as related.

- Place labels, controls, helper text, and errors close to the fields they describe.
- Separate unrelated controls with spacing.

### Law of Pragnanz

People interpret complex visuals in the simplest possible way.

- Prefer simple visual forms and unambiguous icons.
- Avoid decorative complexity that competes with task clarity.

### Law of Similarity

Similar elements are perceived as related.

- Use consistent styling for repeated actions and states.
- Use differences in color, size, or position only when the meaning differs.

### Law of Uniform Connectedness

Visually connected elements are perceived as related.

- Use alignment, containers, and step indicators to show relationships.
- Connect form sections and workflow steps clearly.

### Mental Model

Users have an internal model of how they expect the system to work.

- Match behavior to expectations.
- Explain unusual states in context.
- Reinforce the user's model through labels, empty states, and confirmations.

### Miller's Law

People can hold only a limited number of items in working memory.

- Organize content into small groups.
- Avoid long menus or dense, ungrouped lists.
- Use clear sections instead of one large wall of controls.

### Occam's Razor

Prefer the simplest complete solution.

- Treat a UI as complete when nothing unnecessary remains.
- Avoid adding new controls, states, or copy unless they improve the task.

### Paradox of the Active User

Users usually start using software immediately instead of reading instructions.

- Put guidance in context.
- Use inline hints, empty states, and validation messages.
- Make onboarding optional and skippable.

### Peak-End Rule

People judge an experience by its strongest moment and its ending.

- Avoid negative peaks such as dead ends, unclear errors, and long waits.
- Make success states clear and satisfying.
- End booking, sign-up, login, and scheduling flows with confirmation and a next step.

### Postel's Law

Be flexible in what you accept and clear in what you produce.

- Trim and normalize input where reasonable.
- Accept common user variations.
- Show specific validation feedback when input cannot be accepted.

### Serial Position Effect

Users remember first and last items best.

- Put key navigation and actions in strong positions.
- Put less important items in the middle.
- Order actions deliberately.

### Tesler's Law

Some complexity cannot be removed, only shifted.

- Shift complexity to the system where possible.
- Use defaults, validation, and automation to reduce user burden.
- Make unavoidable complexity understandable.

### Von Restorff Effect

Distinct items stand out and are remembered.

- Use contrast for critical actions, warnings, and current states.
- Do not overuse emphasis or everything becomes noisy.

### Zeigarnik Effect

People remember incomplete tasks.

- Use progress indicators for multi-step or long tasks.
- Help users resume unfinished flows where relevant.
- Make pending states visible and actionable.

## Badminton-App Application Notes

- Event catalog pages should load quickly and never hide permission or network failures behind endless spinners.
- Event cards should clearly show date, location, capacity, cost split, booking state, and payment state.
- Admin scheduling should provide immediate feedback, then clear success or error messages.
- Sign-in and account creation should feel familiar and should support clear recovery from auth errors.
- Booking and cancellation actions should be large enough for mobile taps and should sit near the event they affect.
- Primary actions should be visually clear, but secondary actions should remain discoverable without competing.
- Empty states should explain what is happening and, for admins, offer the next action.
- Mobile layouts should prioritize scanning, readable type, and comfortable tap spacing.
