---
title: "Home"
nav_order: 0
render_with_liquid: false
---

# OTel Collector Migration Guide

A field guide for SREs and platform engineers migrating production observability from vendor agents (Datadog, New Relic, Splunk) to the upstream OpenTelemetry Collector, with Honeycomb as the target backend. Every recommendation includes the config to implement it, the math behind the sizing, what breaks when it fails, and what you trade away by choosing it.

---

## Prerequisites

Before you start, you need:

- **OTel SDK instrumentation** in your services (or a concrete plan to add it). The Collector does not generate telemetry; it ships it.
- **A Kubernetes cluster or VM fleet** where you can deploy the Collector. This guide covers both, but most architectures assume K8s unless stated otherwise.
- **A Honeycomb team and API key** with ingest permissions. Environment-per-service or a single environment — either works, but decide before chapter 01.
- **Familiarity with YAML and your deployment tooling** (Helm, Kustomize, Terraform, Ansible). Every config in this guide is plain YAML; wiring it into your CD pipeline is on you.

---

## Table of Contents

| # | Chapter | What it covers |
|---|---------|---------------|
| 01 | [Migration Phases](01-migration-phases.md) | Phase 0 (inventory) through Phase 3 (decommission). Dual-ship strategy, rollback gates, a 12-week timeline you can hand to leadership. |
| 02 | [Deployment Modes](02-deployment-modes.md) | DaemonSet vs. sidecar vs. standalone gateway. Resource cost, failure domains, and when each mode is the wrong choice. |
| 03 | [Agent + Gateway Topology](03-agent-gateway-topology.md) | The canonical two-tier production architecture: per-node agents forwarding to a gateway pool. Includes the full data flow, load-balancing, and what happens when the gateway pool goes down. |
| 04 | [Tiered Gateways](04-tiered-gateways.md) | Multi-tier gateway trees, multi-cluster federation, and regional routing. For orgs that outgrow a single gateway pool. |
| 05 | [Signal Separation](05-signal-separation.md) | Per-signal Collector pools (traces, metrics, logs), priority tiers, isolating noisy services so they cannot starve critical ones. |
| 06 | [Tuning for Production](06-tuning-production.md) | Memory limiter, batch processor, queue sizing, retry policy. Real numbers, real formulas, real `pprof` output. |
| 07 | [Backpressure Handling](07-backpressure.md) | End-to-end backpressure from the SDK through the agent to the gateway to the backend. Graceful degradation strategies and what data you lose first. |
| 08 | [Bare Metal and VMs](08-bare-metal-and-vms.md) | Non-Kubernetes deployments: systemd units, EC2 user-data, configuration management, fleet-wide upgrades. |
| 09 | [Monitoring the Collector](09-monitoring-the-collector.md) | Internal metrics, Prometheus scrape targets, health checks, alerting rules, and a troubleshooting flowchart for "where are my spans?" |
| 10 | [Vendor-Specific Runbooks](10-vendor-specific-runbooks.md) | Step-by-step migration playbooks from Datadog Agent, New Relic Infrastructure, Splunk OTel Collector (vendor fork), Prometheus, and Jaeger. |

---

## Reading Paths

Not everyone starts in the same place. Pick the path that matches your situation and read those chapters in order.

**"I'm starting a migration from scratch."**
01 &rarr; 02 &rarr; 03 &rarr; 10 &rarr; 06
Get the timeline, pick your deployment mode, stand up the canonical topology, follow the runbook for your current vendor, then harden.

**"I already have Collectors running. I need production hardening."**
06 &rarr; 07 &rarr; 09 &rarr; 04 &rarr; 05
Tune what you have, understand backpressure, instrument the Collector itself, then scale out with tiered gateways and signal separation.

**"I need to migrate bare-metal or VM workloads."**
08 &rarr; 01 &rarr; 06 &rarr; 09
Start with the non-K8s deployment guide, then follow the migration phases, tune, and set up monitoring.

---

## Reference Configs

Complete, annotated YAML configs live in [`configs/`](configs/). Inline snippets throughout the chapters are excerpts from these files.

| File | Description |
|------|-------------|
| [`configs/agent-daemonset.yaml`](configs/agent-daemonset.yaml) | Per-node agent config: OTLP receiver, memory limiter, batch processor, OTLP/gRPC exporter to the gateway pool. |
| [`configs/gateway.yaml`](configs/gateway.yaml) | Gateway pool config: OTLP/gRPC receiver, tail sampling, attribute processing, OTLP/gRPC exporter to Honeycomb. |
| [`configs/gateway-metrics-only.yaml`](configs/gateway-metrics-only.yaml) | Signal-separated gateway dedicated to metrics: Prometheus receiver, delta conversion, Honeycomb metrics exporter. |
| [`configs/bare-metal-systemd.yaml`](configs/bare-metal-systemd.yaml) | Standalone Collector config for systemd-managed hosts, including filelog receiver for syslog and journald. |
| [`configs/dual-ship.yaml`](configs/dual-ship.yaml) | Dual-ship config with fan-out exporters: sends to both the legacy vendor and Honeycomb during migration Phase 1. |
| [`configs/monitoring.yaml`](configs/monitoring.yaml) | Internal telemetry config: self-scrape, Prometheus exposition, health-check extension, zpages. |

---

## Conventions

- **Inline YAML snippets are excerpts.** They show the relevant section of a config, not the whole file. The full, copy-pasteable config is always in `configs/`.
- **Mermaid diagrams** are used for architecture visuals. They render natively in GitHub, Obsidian, and VS Code (with the Markdown Preview Mermaid extension).
- **All configs target `otelcol-contrib`**, not the core distribution. The core distribution lacks processors and receivers used throughout this guide (e.g., `tailsamplingprocessor`, `filelogreceiver`, `k8sattributesprocessor`). If you need a minimal binary, build a custom distribution with `ocb` (OpenTelemetry Collector Builder) and include only the components you use.
- **Honeycomb is the target backend, but the architectures are OTLP-standard.** Swap the exporter block and these topologies work with any OTLP-compatible backend.
