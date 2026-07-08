---
type: concept
title: Online Reinforcement Learning for Self-Correction (SCoRe and the GRPO Family)
description: Supervised fine-tuning on offline correction traces causes behavior collapse; SCoRe's two-stage on-policy RL with a shaped progress reward teaches models to genuinely edit rather than repeat their first answer.
confidence: 0.95
tags: [reinforcement-learning, self-correction, grpo, training, policy-optimization]
category: core-reasoning
source_doc: the-mechanics-of-cognitive-calibration-self-reflection,-intrinsic-correction,-an.md
---

# Online Reinforcement Learning for Self-Correction (SCoRe and the GRPO Family)

## Core Idea
Supervised fine-tuning on static offline error-correction traces fails to generalize (a distribution mismatch between recorded errors and runtime errors) and can cause behavior collapse, where the model just repeats its first answer instead of revising it. SCoRe (Self-Correction via Reinforcement Learning) trains a single model on entirely self-generated data in two stages: Stage I decouples the first and second attempts by maximizing second-attempt correctness while KL-penalizing the first attempt to stay near the base model's distribution, forcing the model to learn to correct a wide range of first-attempt errors rather than change its initial strategy; Stage II jointly trains both attempts with a shaped progress reward `R(y2) + α·(R(y2) - R(y1))` that explicitly rewards the positive delta between attempts, directly incentivizing genuine editing. Ablations show skipping Stage I's decoupling, or using standard single-turn RL, both degrade or reverse the improvement from the first to second attempt. Related policy-optimization variants (GRPO, GSPO, DAPO, BAPO, Dr.GRPO) each address a specific training-stability failure mode — value-network variance, token- vs. sequence-level importance ratios, entropy collapse in long thought chains, and length bias respectively.

## When To Use
This is a model-training technique, relevant when you control pretraining/fine-tuning of a base model and want it to natively perform reliable multi-turn self-correction, rather than relying on prompting or scaffolding.

## NeuroSync Applicability
Not currently implemented in NeuroSync. NeuroSync does not train or fine-tune any models — `src/core/routeswitch` calls external hosted or local providers as fixed, already-trained black boxes (see `src/core/routeswitch/providers.ts`), so none of SCoRe's two-stage RL training or the GRPO-family policy-optimization techniques apply; there is no training loop anywhere in `src/core`.

## Tradeoffs / Risks
On-policy RL training is expensive and requires a reliable reward signal (final-answer correctness) at scale — not available for open-ended or subjective tasks. The source's own ablations show these techniques are fragile to get right: skipping the Stage I decoupling step, or naively applying single-turn RL, actively makes second-attempt performance worse than the baseline, not better.
