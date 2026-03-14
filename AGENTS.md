# Guidelines

- Write idiomatic, simple, maintainable code. Always ask yourself if this is the most simple intuitive solution to the problem. Always KISS (Keep It Simple Stupid). DRY. YAGNI. TDD. Frequent commits.
- Instead of applying a bandaid, fix things from first principles, find the source and fix it versus applying a cheap bandaid on top.
- Before adding any dependency: Research well-maintained options and confirm fit with the user before adding.
- For Web Projects, Always use agent-browser skill to test changes/features.

## ENTROPY REMINDER

This codebase will outlive you. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Tests Rules

### Test Enforcement

- Every change must be programmatically tested. Write a new test or update an existing test, then run the affected tests to make sure they pass.
- Run the minimum number of tests needed to ensure code quality and speed.
- Failing tests are acceptable when they expose genuine bugs and test correct behavior


## Specialized Subagents

- Oracle
  Invoke for: code review, architecture decisions, debugging analysis, refactor planning, second opinion.

- Librarian
  Invoke for: understanding 3rd party libraries/packages, exploring remote repositories, discovering open source patterns.
