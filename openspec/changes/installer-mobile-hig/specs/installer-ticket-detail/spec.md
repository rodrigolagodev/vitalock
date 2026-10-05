# Delta for installer-ticket-detail

**Change**: installer-mobile-hig
**Date**: 2026-10-05

Phase F3 mobile ergonomics for `TaskDetailPage`. Purely ADDED requirements; the baseline requirements on categories and gates are unchanged. "Terminal actions" are Resolver (equipment-update tasks) and Finalizar (all other tasks resolved through the batch/generic path); both are immutable once done, so both require confirmation. "Secondary tasks" are configuring equipment (`ConfigureEquipmentInline` for `install_equipment` / `replace_equipment`) and adding a comment. "Offline" means `navigator.onLine === false`. All UI copy stays Spanish. `ConfirmDialog` is the shared confirmation dialog in `packages/ui`.

## ADDED Requirements

### Requirement: Sticky Action Bar with Confirmation

`TaskDetailPage` MUST render its terminal action (Resolver or Finalizar, whichever applies to the task) in a bar fixed to the bottom of the screen above the TabBar, outside the scrolling content, so it stays reachable by thumb at any scroll position. The bar MUST use a translucent material (backdrop blur) with a top hairline border, MUST include the bottom inset such that it never overlaps the home indicator, and MUST NOT cover the last content element (the page reserves equivalent bottom space). The action button MUST be at least 44px tall and full width within the bar. The terminal action MUST NOT also appear at the top of the page. Activating it MUST open a `ConfirmDialog` stating the action; the mutation MUST run only when the user confirms, and MUST NOT run if the user cancels or dismisses. While the mutation is pending the button shows its progress label and is disabled; Spanish labels are kept ("Resolver tarea", "Finalizar tarea", "Resolviendo...", "Finalizando...").

#### Scenario: Action bar is sticky and safe-area aware

- GIVEN `TaskDetailPage` renders a resolvable task
- WHEN the action bar class list is inspected
- THEN it is fixed/sticky to the bottom, includes a backdrop-blur class (it adds no safe-area padding of its own because the TabBar below it consumes the inset)
- AND it sits above the TabBar so neither overlaps the other

#### Scenario: Action is not duplicated at the top

- GIVEN `TaskDetailPage` renders a resolvable task
- WHEN the document is queried for the terminal action button
- THEN exactly one is found and it is inside the action bar

#### Scenario: Finalizar asks for confirmation first

- GIVEN a task resolved through the batch/generic path and a `resolveBatch` mutation spy
- WHEN the user clicks "Finalizar tarea"
- THEN a ConfirmDialog opens
- AND the mutation has not been called

#### Scenario: Confirming runs the mutation

- GIVEN the Finalizar ConfirmDialog is open
- WHEN the user confirms
- THEN the mutation is called exactly once
- AND the dialog closes

#### Scenario: Cancelling does not mutate

- GIVEN the Finalizar ConfirmDialog is open
- WHEN the user cancels or dismisses it
- THEN the mutation is never called and the task is unchanged

#### Scenario: Resolver also asks for confirmation

- GIVEN an equipment-update task and a `resolveUpdate` mutation spy
- WHEN the user clicks "Resolver tarea"
- THEN a ConfirmDialog opens and the mutation has not been called
- AND after the user confirms, the mutation is called exactly once

#### Scenario: Pending state disables the button

- GIVEN a mutation is pending
- WHEN the action bar renders
- THEN the button is disabled and shows "Resolviendo..." or "Finalizando..."

#### Scenario: Content is not hidden by the bar

- GIVEN a long task detail page
- WHEN the user scrolls to the end
- THEN the final content element is fully visible above the action bar

### Requirement: Secondary Tasks in a Bottom Sheet

Configuring equipment and adding a comment MUST open in a bottom `Sheet` (see `design-system` Bottom Sheet Presentation) instead of inline blocks at the top of the page. The sheet MUST open from an explicit trigger on the page, MUST close via the "Cerrar" control and via dismissal gestures supported by the primitive, and MUST close automatically after a successful submit. Opening a sheet MUST NOT start a terminal action. Existing form behaviour, validation and Spanish copy of `ConfigureEquipmentInline` and the comment form MUST be unchanged.

#### Scenario: Configure equipment opens a bottom sheet

- GIVEN the page for an `install_equipment` task whose serial is not yet configured
- WHEN the user taps the configure trigger
- THEN a bottom Sheet opens containing the configure form
- AND the form is not rendered inline in the page body beforehand

#### Scenario: Add comment opens a bottom sheet

- GIVEN `TaskDetailPage` renders any task
- WHEN the user taps the add-comment trigger
- THEN a bottom Sheet opens containing the comment form

#### Scenario: Sheet closes after successful submit

- GIVEN a secondary-task sheet is open and its submit mutation succeeds
- WHEN the submission resolves
- THEN the sheet closes and the page shows the updated state

#### Scenario: Sheet closes without submitting

- GIVEN a secondary-task sheet is open
- WHEN the user activates "Cerrar"
- THEN the sheet closes and no mutation was called

#### Scenario: Opening a sheet does not trigger a terminal action

- GIVEN a sheet trigger is activated
- WHEN the sheet opens
- THEN neither the Resolver nor the Finalizar mutation, nor a ConfirmDialog, has been triggered

### Requirement: Offline-disabled Mutations

While offline, every mutation-triggering control on `TaskDetailPage` (the terminal action button and the submit controls of the secondary-task sheets) MUST be disabled and MUST show the reason "Sin conexión" in place of, or alongside, its label (visible text, not only a tooltip). Read-only affordances (navigation, opening a sheet to read, downloads of already-resolved URLs) MUST keep working. When the browser reports online again the controls MUST re-enable without a reload. This gating only reacts to `navigator.onLine`; server errors continue to surface through the existing toasts and are not suppressed by it.

#### Scenario: Terminal action disabled offline with reason

- GIVEN `navigator.onLine` is false
- WHEN `TaskDetailPage` renders a resolvable task
- THEN the terminal action button is disabled
- AND the text "Sin conexión" is visible in or next to it
- AND clicking it opens no ConfirmDialog and runs no mutation

#### Scenario: Sheet submit disabled offline

- GIVEN `navigator.onLine` is false and a secondary-task sheet is open
- WHEN the submit control is inspected
- THEN it is disabled and shows "Sin conexión"

#### Scenario: Re-enables when back online

- GIVEN the controls are disabled offline
- WHEN the window dispatches an `online` event
- THEN the terminal action button is enabled and no longer shows "Sin conexión"

#### Scenario: Online behaviour is unchanged

- GIVEN `navigator.onLine` is true
- WHEN `TaskDetailPage` renders
- THEN no control shows "Sin conexión" and the actions behave as specified above

#### Scenario: Server errors still toast

- GIVEN the device is online but a mutation rejects
- WHEN the rejection occurs
- THEN the existing error toast is shown

### Requirement: Touch-safe Inputs

Every text-entry control rendered by the installer MUST render its text at 16px or larger (no `text-sm`/`text-xs` on inputs, textareas or select triggers) so iOS Safari does not zoom on focus. The serial-number input in `ConfigureEquipmentInline` MUST be wrapped in `FormField` with a visible Spanish label (associated through `htmlFor`/`id`), and MUST set `autoCapitalize="characters"`, `autoCorrect="off"` and `spellCheck={false}`. Validation errors on it MUST be exposed through `FormField` (`role="alert"`, `aria-invalid="true"`).

#### Scenario: Serial input has a visible label

- GIVEN `ConfigureEquipmentInline` renders
- WHEN the test queries `getByLabelText` with the serial label text
- THEN it returns the serial input
- AND the label is visible text, not only a placeholder

#### Scenario: Serial input suppresses autocorrection

- GIVEN `ConfigureEquipmentInline` renders
- WHEN the serial input's attributes are read
- THEN `autocapitalize` is `characters`, `autocorrect` is `off` and `spellcheck` is `false`

#### Scenario: Serial validation error is announced

- GIVEN the serial field is submitted empty or invalid
- WHEN the error appears
- THEN `getByRole('alert')` contains the error text and the input has `aria-invalid="true"`

#### Scenario: Installer inputs are at least 16px

- GIVEN the installer inputs, textareas and select triggers render (login, serial, comment, search/filter if any)
- WHEN their class lists are inspected
- THEN none includes `text-sm` or `text-xs`
- AND each resolves to a text size of at least 16px (`text-base` or a touch-scale ladder token at 16px or more)
