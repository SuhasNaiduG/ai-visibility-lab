# AI Visibility Engineering Lab — Build Journal

## Milestone 1 — Foundation

### Goal

Build a deterministic technical analysis engine before introducing any AI interpretation.

The philosophy is:

```
Observe
→ Measure
→ Analyze
→ Implement
→ Verify
→ Monitor
```

AI should only assist where human interpretation is valuable.

Deterministic engineering always comes first.

---

# Step 1 — Repository Initialization

### Objective

Create a clean engineering repository.

### Accomplishments

* Initialized Git repository.
* Created Node.js project.
* Generated `package.json`.
* Established the repository as the single source of truth.

### Why it matters

Every engineering project should begin with version control. Small, focused commits make changes easy to review, test, and revert.

---

# Step 2 — TypeScript Foundation

### Objective

Configure a strict TypeScript environment.

### Accomplishments

* Added TypeScript configuration.
* Enabled strict compiler settings.
* Configured build output.
* Verified the project builds successfully.

### Why it matters

Strict TypeScript catches many mistakes before code reaches production and provides a solid foundation for a growing codebase.

---

# Step 3 — Build Pipeline

### Objective

Ensure the project can be built consistently.

### Accomplishments

* Configured build script.
* Configured development script.
* Configured testing script.
* Successfully executed:

```
npm run build
```

### Why it matters

A working build pipeline is the first proof that the project is reproducible and ready for continuous development.

---

# Step 4 — URL Normalization

### Objective

Create the first deterministic component.

Implemented:

```
normalizeUrl()
```

Responsibilities:

* Trim whitespace.
* Add HTTPS when missing.
* Reject empty URLs.
* Reject unsupported protocols.
* Remove URL fragments.
* Return a normalized URL object.

### Why it matters

Every later analyzer depends on receiving a valid canonical URL. Fixing bad input early prevents cascading errors.

---

# Step 5 — Test-Driven Development

### Objective

Validate URL normalization with automated tests.

Tests created:

* Missing protocol
* Existing HTTPS
* Whitespace trimming
* Fragment removal
* Empty URL
* Unsupported protocol
* Malformed URL

Result:

```
7/7 tests passing
```

### Important Lesson

A bug was discovered during testing.

Originally, the protocol detection only recognized HTTP and HTTPS.

This caused:

```
ftp://example.com
```

to become

```
https://ftp://example.com
```

instead of being rejected.

The tests exposed this defect before it could affect later components.

The implementation was corrected by detecting any URI scheme first, then explicitly allowing only HTTP and HTTPS.

### Why it matters

This demonstrates the value of deterministic testing:

* Tests verify behavior.
* Tests reveal defects.
* Code is improved based on evidence rather than assumptions.

---

# Current Engineering Status

Completed:

* Git repository initialized
* Node project initialized
* TypeScript configured
* Build pipeline working
* URL normalization implemented
* Automated tests written
* First production bug discovered
* Bug fixed through testing
* Build passes
* Test suite passes

---

# Engineering Principles Followed

* Execution before presentation.
* Deterministic logic before AI.
* Evidence before recommendations.
* Small verified milestones.
* Test-driven improvements.
* Focused Git commits.
* Build verification after each milestone.

---

# Next Milestone

Implement the first real crawler.

The analyzer will fetch a webpage and return:

* HTTP status
* Final resolved URL
* Response time
* Fetch timestamp

This establishes the foundation for deterministic HTML analysis before extracting metadata, headings, schema, links, and technical SEO signals.

📖 Build Journal — Step 7

Add this section to docs/build-journal.md:

Step 7 — Implement the HTML Fetcher

Objective

Create the first deterministic crawler capable of retrieving webpage content and crawl metadata.

Accomplishments

Implemented fetchHtml().
Configured automatic redirect handling.
Added a custom User-Agent.
Measured response time.
Recorded the fetch timestamp.
Captured the final resolved URL and HTTP status code.

Why it matters

The crawler is intentionally separated from parsing logic. Its responsibility is to reliably retrieve webpage content and metadata. Keeping fetching independent from analysis makes the system easier to test, extend, and reuse in future analyzers.

Engineering principle

Separate data acquisition from data interpretation.

This distinction will become the foundation of the entire AI Visibility Engineering Lab.


**"Up to this point, you've built real production infrastructure"**