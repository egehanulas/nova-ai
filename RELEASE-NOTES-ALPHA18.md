# NOVA AI Desktop 0.2.0-alpha.18

## Improvements
- Fixed natural-language file moves when the user names the source folder.
- Resolve filenames consistently for opening, moving, and renaming.
- Scope file searches to Desktop, Documents, or Downloads when the user specifies a location.
- Avoid unrelated duplicate-name matches when a source folder is explicit.
- Display file search results with proper line breaks.

## Safety
- File operations remain restricted to the configured Desktop, Documents, and Downloads folders.
- Existing path and symbolic-link checks remain active.
- File move and rename actions still require confirmation.
