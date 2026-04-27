---
name: test-writer
description: Write comprehensive unit and integration tests
triggers:
  - write tests
  - add tests
  - test coverage
  - unit test
tools:
  - read_file
  - write_file
  - glob
  - grep
  - bash
---

# Test Writer Skill

When activated, focus on writing high-quality tests.

## Process

1. Read the code being tested to understand its behavior
2. Identify the test framework already in use (jest, vitest, mocha, pytest, etc.)
3. Match the existing test style and conventions
4. Cover:
   - Happy path
   - Edge cases (empty input, null, boundary values)
   - Error conditions
   - Integration points

## Principles

- Test behavior, not implementation
- One assertion concept per test
- Descriptive test names: `it('returns null when user is not found')`
- No mocks unless necessary - prefer real dependencies for integration tests
- Run tests after writing to verify they pass
