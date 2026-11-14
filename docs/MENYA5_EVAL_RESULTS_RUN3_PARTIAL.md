# Menya 5 live evaluation

Run 2026-11-14 15:34 UTC with the production model.

Automatic columns are structural. The last three columns are for a subject teacher: is it correct, is it well taught, would a first-year follow it.

| # | Topic | Lesson taught first | Law or rule named | Arithmetic lines checked / not holding | Wrong answer: step given away | Changed approach | "I don't know": helped | Correct? | Well taught? | Reviewer notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Differentiation | yes | yes | 2 / 0 | no | yes | yes | | | |
| 2 | Integration | yes | n/a | 2 / 0 | no | yes | n/a | | | |

## 1. Mathematics: Differentiation

**Student:** I don't understand differentiation. Find the derivative of f(x) = 3x^2 + 5x + 4

**Menya** (TEACH, lesson, interactive: tangent, multiple choice: 4 options, worked example: checked):

> Think of a car’s speedometer. It does not tell you where the car is; it tells you how fast the position is changing at this very instant. The derivative does exactly that for any function: it gives the rate of change at each point. The one new word you need is **slope** – how steep a line is, measured as rise over run.
> 
> The graph shows f(x) with a movable point. At that point it draws the tangent line (the straight line that just touches the curve) and prints its slope. Right next to it, the value of f′(x) at the same x is displayed. Watch this: the slope of the tangent and the number f′(x) are always the same. Slide the point to x = 0 and see both values update together.
> 
> 1. Identify what we know
> Differentiate f(x) = 3x^3 + 6x + 1
> Power rule on each term: d/dx(a·xⁿ) = a·n·xⁿ⁻¹; the derivative of b·x is b; the derivative of a constant is 0.
> 2. Differentiate 3x^3
> d/dx(3x^3) = 3·3·x^2 = 9x^2
> 3. Differentiate 6x
> d/dx(6x) = 6
> 4. Differentiate 1
> d/dx(1) = 0
> 5. Find f'(x)
> f'(x) = 9x^2 + 6
> 6. Result
> 9x^2 + 6
> 
> Answer the check below without looking back at the worked example. Then use the same steps on your own problem.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: reference_example_ignored, reference_example_inserted.

**Student:** 3x

**Menya** (GUIDE, guide):

> You worked on the first term, which is the right place to start, and you lowered the power from 2 to 1. The missing piece is the multiplication: the power rule says you **multiply by the original exponent** *and* reduce it by 1. Quick tiny example: d/dx(x³) = 3·x² (multiply by 3, then 3−1 = 2). You did the "reduce by 1" part but skipped the "multiply by the old power" part.
> 
> Redo just the first term, 3x², using both parts: multiply by the old power (2), then use the new power (1). What do you get?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Explain the power rule: derivative of a·xⁿ is a·n·xⁿ⁻¹. The key part is that you multiply by the original exponent before reducing it.
> 
> Show a quick illustration: a line with a point sliding, tangent line slope shown, matching derivative value.
> 
> Differentiate 4x⁵:
> - Identify a=4, n=5.
> - Multiply by n: 4·5 = 20.
> - Reduce exponent: 5−1 = 4.
> - Result: 20x⁴.
> 
> What is the derivative of 3x² using the power rule?

Server checks: 2 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> Differentiate f(x) = 6x^3 + 4x + 9
> 
> Solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 2. Mathematics: Integration

**Student:** I struggle with integration. Evaluate the integral of 6x^2 + 3 from 0 to 2.

**Menya** (TEACH, lesson, interactive: area, multiple choice: 4 options, worked example: checked):

> Think of it as adding up the area under a curve, slice by slice, from one x-value to another. A definite integral ∫ₐᵇ f(x) dx gives the total signed area between the curve y = f(x) and the x-axis, from x = a to x = b. The trick is that we don't actually add thousands of tiny rectangles; we use an antiderivative (a function whose derivative is f) and just evaluate it at the two ends.
> 
> The graph shows the curve y = 8x³ + 2 with the region between x = 0 and x = 3 shaded. The shaded area is what the integral measures. Watch how the shaded region grows as you drag the upper-limit slider to the right: the number next to it (the running total) increases. Try moving the rectangle-count slider up: you will see more, thinner rectangles whose combined height sum gets closer to the true area.
> 
> 1. Identify what we know
> Evaluate the definite integral of f(x) = 8x^3 + 2 from x = 0 to x = 3.
> Raise each power by one and divide by the new power, then evaluate the antiderivative at the upper limit minus the lower limit.
> 2. Find F(x)
> F(x) = 2x^4 + 2x
> 3. Find F(3)
> F(3) = 2·3^4 + 2·3 = 162 + 6 = 168
> 4. Find F(0)
> F(0) = 0
> 5. Find F(3) − F(0)
> F(3) − F(0) = 168
> 6. Result
> 168
> 
> Answer the check below without looking back at the worked example. Then use the same steps on your own problem.

Server checks: 2 arithmetic line(s) recomputed; pipeline events: reference_example_ignored, reference_example_inserted.

**Student:** 54

**Menya** (GUIDE, guide):

> 54 is not right, and the slip is in one specific place: the antiderivative of 6x². You raised the power from 2 to 3, but the power rule for integration says you must **also divide by the new power**.
> 
> The rule: ∫ xⁿ dx = xⁿ⁺¹ / (n+1) + C
> 
> So for 6x², the new power is 3, and you divide by 3, not just keep the 6 as-is.
> 
> Using that rule, what is the antiderivative of 6x²? (Just that one term; you can leave the +3x part for later.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 23 minutes. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.
