---
name: Feature request
about: Suggest a new capability or improvement
title: "[feature] "
labels: ["enhancement"]
---

## Use case

<!-- What are you trying to do that the template doesn't support today? -->

## Proposed solution

<!-- What would you like to see? Be concrete: env var? new Terraform variable?
new file? new UI element? -->

## Alternatives considered

<!-- Other approaches you weighed and why this one is better. -->

## Will this affect the cheap-by-default behaviour?

<!--
The template's defaults are tuned for low idle cost (frontend min_replicas=0,
backend min_replicas=1 to avoid first-request 504s, Postgres B1ms, mock AI
provider). If your proposal would raise the default cost further or require
more always-on resources, call that out so we can keep the cheap path intact
behind a feature flag.
-->

- [ ] No, it's behind an opt-in flag / variable
- [ ] Yes, and that's intentional because: <!-- explain -->

## Anything else?

<!-- Links to upstream samples, related issues, prior art. -->
