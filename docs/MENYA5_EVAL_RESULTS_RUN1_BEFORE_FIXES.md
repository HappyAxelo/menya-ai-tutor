# Menya 5 live evaluation

Run 2026-11-14 00:33 UTC with the production model.

Automatic columns are structural. The last three columns are for a subject teacher: is it correct, is it well taught, would a first-year follow it.

| # | Topic | Lesson taught first | Law or rule named | Arithmetic lines checked / not holding | Wrong answer: step given away | Changed approach | "I don't know": helped | Correct? | Well taught? | Reviewer notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Differentiation | yes | yes | 0 / 0 | no | yes | yes | | | |
| 2 | Integration | **no** | n/a | 0 / 0 | n/a | n/a | n/a | | | |
| 3 | Differential equations | **no** | n/a | 0 / 0 | n/a | n/a | n/a | | | |
| 4 | Matrices | **no** | n/a | 0 / 0 | n/a | n/a | n/a | | | |
| 5 | Probability | **no** | n/a | 0 / 0 | n/a | n/a | n/a | | | |
| 6 | Complex numbers | **no** | n/a | 0 / 0 | n/a | n/a | n/a | | | |
| 7 | Newton's laws | **no** | **no** | 0 / 0 | n/a | n/a | n/a | | | |
| 8 | Projectile motion | **no** | n/a | 0 / 0 | n/a | n/a | n/a | | | |
| 9 | Electricity | yes | yes | 0 / 0 | no | yes | yes | | | |
| 10 | Kirchhoff's laws | yes | yes | 4 / 0 | no | yes | yes | | | |
| 11 | Electromagnetic induction | **no** | **no** | 0 / 0 | n/a | n/a | n/a | | | |
| 12 | Wave mechanics | yes | n/a | 1 / 0 | no | yes | yes | | | |
| 13 | Circuit analysis | **no** | n/a | 0 / 0 | n/a | n/a | n/a | | | |
| 14 | Signal processing | **no** | **no** | 0 / 0 | n/a | n/a | n/a | | | |
| 15 | Control systems | yes | n/a | 2 / 0 | no | yes | n/a | | | |
| 16 | Semiconductor fundamentals | **no** | n/a | 0 / 0 | n/a | n/a | n/a | | | |
| 17 | Algorithms | **no** | n/a | 0 / 0 | n/a | n/a | n/a | | | |
| 18 | Data structures | yes | n/a | 0 / 0 | no | n/a | n/a | | | |
| 19 | Programming logic | **no** | n/a | 0 / 0 | n/a | n/a | n/a | | | |
| 20 | Computational complexity | yes | n/a | 0 / 0 | no | yes | n/a | | | |

## 1. Mathematics: Differentiation

**Student:** I don't understand differentiation. Find the derivative of f(x) = 3x^2 + 5x + 4

**Menya** (TEACH, lesson):

> Think of speed as how fast distance changes; the derivative tells how fast any quantity changes at an instant. In calculus the derivative of a function gives its instantaneous rate of change. The power rule lets us differentiate terms of the form xⁿ.
> 
> Picture a smooth curve of the function; the slope of the tangent line at a point equals the derivative there. Notice the tangent line touches the curve at just one point and its steepness tells the rate of change.
> 
> 1. We have g(x)=2x³ − 4x + 7; we need g'(x).
> 2. Apply the power rule to 2x³: derivative is 3·2·x² = 6x² (power rule: d/dx[xⁿ]=n·xⁿ⁻¹).
> 3. Apply the power rule to –4x (x¹): derivative is 1·(–4)·x⁰ = –4.
> 4. The constant 7 has derivative 0 because a constant does not change.
> 5. Combine the results: g'(x)=6x² − 4. Check by evaluating at x=1: g(1)=5, g'(1)=2, which matches the slope of the tangent.
> 
> What is the derivative of the term 3x² in your function?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 3x

**Menya** (GUIDE, guide):

> The derivative of a term xⁿ is n·xⁿ⁻¹. For 3x², n=2 and the coefficient 3 stays.
> 
> You wrote 3x, which looks like you kept the coefficient but dropped the power rule factor 2. The correct derivative of 3x² is 6x.
> 
> What is the derivative of 3x²?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> For the term x², the derivative is 2x. Therefore d/dx[3x²]=3·(2x).
> 
> The power rule says d/dx[x^n]=n·x^{n-1}. It lets us turn a power of x into a simpler expression.
> 
> What is 3·2x equal to?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 2. Mathematics: Integration

**Student:** I struggle with integration. Evaluate the integral of 6x^2 + 3 from 0 to 2.

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 3. Mathematics: Differential equations

**Student:** I don't get differential equations. Solve dy/dt = -0.5y with y(0) = 8 and find y(2).

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 4. Mathematics: Matrices

**Student:** Teach me how to multiply matrices. A has rows (1, 2) and (3, 4), B has rows (0, 1) and (5, 2). Find AB.

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 5. Mathematics: Probability

**Student:** Two machines fail independently with probabilities 0.2 and 0.3. What is the probability at least one fails? I never know when to add or multiply.

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 6. Mathematics: Complex numbers

**Student:** Help me understand multiplying complex numbers: (2 + 3i)(1 - 4i).

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 7. Physics: Newton's laws

**Student:** I can't understand Newton's second law. A 5 kg crate is pushed with 16 N against 6 N of friction. What is its acceleration?

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 8. Physics: Projectile motion

**Student:** A ball is launched at 20 m/s at 30 degrees. Find its range. I don't understand projectiles.

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 9. Physics: Electricity

**Student:** Explain Ohm's law. A 12 V battery is across a 4 ohm resistor: what current flows?

**Menya** (TEACH, lesson):

> Just like water flowing through a pipe, the voltage is the pressure pushing electric charge, resistance is the pipe’s width, and current is the flow rate. Ohm’s law states that the current through a resistor is directly proportional to the voltage across it and inversely proportional to its resistance.
> 
> Imagine the simple circuit: a battery of 12 V connected to a single resistor. The battery provides the voltage, the resistor opposes the flow, and the current is the same everywhere in this series loop. Notice that only one resistor is present, so the whole voltage appears across it.
> 
> 1. We have a 9 V battery and a 3 Ω resistor; we need the current I.
> 2. Apply Ohm’s law I = V / R (current equals voltage divided by resistance).
> 3. Substitute the numbers: I = 9 V / 3 Ω.
> 4. Compute: I = 3 A. Check: units V/Ω give A, and 3 A × 3 Ω = 9 V, matching the source.
> 
> Using Ohm’s law, write the formula for the current I in terms of the given voltage and resistance.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 48 A

**Menya** (GUIDE, guide):

> Ohm’s law says that the current through a resistor equals the voltage across it divided by its resistance: I = V / R. The units work out to amperes because volts divided by ohms gives amperes.
> 
> You gave 48 A, which is far too large for a 12 V battery with a 4 Ω resistor. The mistake is in the division: you probably multiplied instead of dividing, or used the wrong numbers.
> 
> Using I = V / R, what is 12 divided by 4?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Carry out the step you've just set up and tell me what you get.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (GUIDE, guide):

> You said you don’t know how to continue. The only operation left is dividing the voltage by the resistance. Division asks how many times the divisor (4) fits into the dividend (12).
> 
> What is 12 divided by 4?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 10. Physics: Kirchhoff's laws

**Student:** I can't understand Kirchhoff's laws. A 12 V battery is in series with a 2 ohm resistor, then two parallel branches of 3 ohm and 6 ohm. Find the current in each branch.

**Menya** (TEACH, lesson):

> Imagine a water pipe with a single source, a narrow section, then a split into two branches that recombine. The amount of water that flows through each branch depends on the resistance of that branch, just like water speed depends on pipe diameter. In electrical circuits, Kirchhoff’s laws let us calculate the currents and voltages in such networks.
> 
> The picture shows a 12 V battery, a 2 Ω resistor, then a junction where the circuit splits into a 3 Ω and a 6 Ω resistor that join again. The battery is the source, the 2 Ω is in series, and the two resistors are in parallel. The key point is that the voltage across each parallel branch is the same, and the currents add at the junction.
> 
> 1. Known: 9 V battery, 1 Ω resistor, then 4 Ω and 8 Ω in parallel. 2. Total resistance: 1 Ω + (1/(1/4 + 1/8)) = 1 Ω + 2.667 Ω = 3.667 Ω. 3. Total current: I = 9 V / 3.667 Ω = 2.455 A. 4. Voltage across parallel part: Vp = I * 1 Ω = 2.455 V. 5. Current through 4 Ω: I4 = Vp / 4 Ω = 0.614 A. 6. Current through 8 Ω: I8 = Vp / 8 Ω = 0.307 A. 7. Check: I4 + I8 = 0.921 A, which equals the current through the parallel part. All units are consistent.
> 
> In your circuit, what is the voltage that appears across the two parallel branches?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 4 A and 2 A

**Menya** (GUIDE, guide):

> You're aiming at the right quantities (the two branch currents), but 4 A and 2 A would come from putting the full 12 V straight across the 3 Ω and 6 Ω resistors. The 2 Ω resistor sits in series before the split, so it takes part of the 12 V. The parallel branches only see whatever is left after that drop.
> 
> Think of it this way: the 2 Ω resistor and the parallel pair form one series loop. In a series loop the source voltage is shared: V_battery = V_2Ω + V_parallel. So V_parallel is less than 12 V, which means each branch current is less than what you'd get from 12 V alone.
> 
> Before you can find the branch currents, you need the voltage across the parallel pair. To get that, first find the total resistance the battery sees. What is the equivalent resistance of the 3 Ω and 6 Ω in parallel, and what is the total resistance of the whole circuit?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> When two resistors sit side by side (in parallel), the combined resistance is **smaller** than either one, because current has two paths to share. The formula for two resistors in parallel is:
> 
> R_p = (R₁ × R₂) / (R₁ + R₂)
> 
> Say you have 4 Ω and 8 Ω in parallel:
> R_p = (4 × 8) / (4 + 8) = 32 / 12 ≈ 2.67 Ω
> 
> Notice: 2.67 Ω is less than 4 Ω and less than 8 Ω. That makes sense – two paths together resist less than one path.
> 
> In your circuit the 3 Ω and 6 Ω are the parallel pair. Applying the same formula:
> 
> R_p = (3 × 6) / (3 + 6) = 18 / 9 = **2 Ω**
> 
> So that whole parallel section behaves like a single 2 Ω resistor.
> 
> Now your circuit is just the 2 Ω series resistor next to this 2 Ω equivalent. What is the total resistance the 12 V battery sees?

Server checks: 4 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (GUIDE, guide):

> Consider a circuit with a 9 V battery. In series with the battery is a 3 Ω resistor. From the junction after the 3 Ω resistor, the circuit splits into two branches that recombine before returning to the battery:
> 
> • Branch A: a 6 Ω resistor directly to ground.
> • Branch B: a 2 Ω resistor in series with a 4 Ω resistor, both to ground.
> 
> Find the current flowing through the 6 Ω resistor, the 2 Ω resistor, and the 4 Ω resistor.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 11. Physics: Electromagnetic induction

**Student:** Teach me electromagnetic induction. The flux through a 200-turn coil changes by 5 mWb in 100 ms. What emf is induced?

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 12. Physics: Wave mechanics

**Student:** I don't understand waves. A wave has frequency 50 Hz and wavelength 2 m. What is its speed?

**Menya** (TEACH, lesson, picture: graph):

> Imagine flicking one end of a long rope up and down. A "bump" travels along the rope, but each small piece of rope only bobs up and down — it does not ride along with the bump. A wave is a disturbance that carries energy from place to place without the material itself travelling with it.
> 
> The picture shows one full wave cycle. The horizontal axis is position along the wave (metres); the vertical axis is how far the medium is displaced from rest. One wavelength (λ) is the distance from one crest to the next crest — one complete up-and-down cycle. The wave moves to the right, yet every point on the rope just oscillates in place.
> 
> 1. We know: f = 10 Hz (10 cycles pass a fixed point each second), λ = 3 m (one cycle is 3 m long). We need: wave speed v.
> 2. The relationship is v = f × λ. Frequency counts how many cycles pass per second; wavelength is the length of each cycle. Multiplying gives (cycles/s) × (m/cycle) = m/s.
> 3. v = 10 Hz × 3 m = 30 m/s.
> 4. Check the units: Hz = 1/s, so (1/s) × m = m/s ✓. Limiting case: if f → 0 (no cycles per second), v → 0. The wave is not moving. Makes sense.
> 
> In your problem f = 50 Hz and λ = 2 m. Substitute those two values into v = f × λ and work out the number with its unit. What do you get?

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 25 m/s

**Menya** (GUIDE, guide):

> You used the correct unit (m/s) but the numeric value is off; the speed should come from multiplying the frequency by the wavelength.
> 
> Write the multiplication that gives the wave speed: what is 50 × 2?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> A wave moves by transferring energy, not by moving the material.
> 
> Picture: one wavelength is the distance between two consecutive crests.
> 
> For f=10 Hz and λ=3 m, v = f × λ = 10 × 3 = 30 m/s.
> 
> Now, using your values f=50 Hz and λ=2 m, write the expression for the speed: v = 50 × 2 = ?
> What is the product of 50 and 2?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (GUIDE, guide):

> You said you don’t know; the missing step is the multiplication 50 × 2.
> 
> Think of 50 as 5 × 10. What is 5 × 2? Then add the zero from the factor 10. What result do you obtain?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 13. Engineering: Circuit analysis

**Student:** A 9 V supply feeds 1 kilo-ohm in series with 2 kilo-ohm. What is the voltage across the 2 kilo-ohm resistor? I don't get voltage dividers.

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 14. Engineering: Signal processing

**Student:** What sampling rate do I need for a signal with components at 1.2 kHz and 3.5 kHz? Explain why.

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 15. Engineering: Control systems

**Student:** A unity feedback loop has G(s) = 9/(2s + 1). What is the steady-state output for a step of 10? I don't understand feedback.

**Menya** (TEACH, lesson):

> Feedback loop is like a thermostat: it measures output and adjusts input to keep output at the desired level. In a unity feedback system the output is fed back directly and subtracted from the reference. The key idea is that the closed‑loop transfer function determines how the system responds to any input.
> 
> The diagram has three blocks: the reference step R(s) entering a summing junction, the forward plant G(s) producing Y(s), and a feedback path that returns Y(s) to the summing point with a minus sign. The closed‑loop transfer function is T(s)=G(s)/(1+G(s)). This tells us the relationship between R(s) and Y(s).
> 
> 1. Given G(s)=5/(s+2) and a step of magnitude 4, find the steady‑state output.
> 2. Form the closed‑loop transfer function: T(s)= (5/(s+2)) / (1+5/(s+2)) = 5/(s+7).
> 3. Input R(s)=4/s, so Y(s)=T(s)·R(s)= (5·4)/(s(s+7)).
> 4. Apply the final‑value theorem: y_ss = lim_{s→0} s·Y(s)= (20)/(0+7)=20/7 ≈2.86.
> 5. Check: units are the same as the step (no units), and as s→0 the denominator dominates, giving a finite value.
> 
> Write the closed‑loop transfer function T(s) for your plant G(s)=9/(2s+1).

Server checks: 2 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 90

**Menya** (GUIDE, guide):

> In a unity‑feedback system the output is fed back and subtracted from the reference. The closed‑loop transfer function tells you how the reference is transformed into the output.
> 
> You correctly multiplied the plant gain 9 by the step magnitude 10, giving 90, but you omitted the effect of the feedback loop. To find the steady‑state output you must first form the closed‑loop transfer function and then apply the final‑value theorem.
> 
> What is the closed‑loop transfer function T(s) for G(s)=9/(2s+1) with unity feedback?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 16. Engineering: Semiconductor fundamentals

**Student:** A silicon diode is in series with a 1000 ohm resistor across 5 V. What current flows? Why is it not 5 mA?

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 17. Computer science: Algorithms

**Student:** How many elements does binary search examine in the worst case for 1000 sorted elements? Teach me why.

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 18. Computer science: Data structures

**Student:** I confuse stacks and queues. If I push 5, push 8, pop, push 3, what does the next pop return?

**Menya** (TEACH, lesson):

> A stack works like a stack of plates: you add (push) to the top and remove (pop) from the top, so the last item placed is the first taken out (LIFO). A queue is like a line at a checkout: you add at the back and remove from the front, so the first item placed is the first taken out (FIFO).
> 
> Imagine a vertical column of boxes. The top box is the only one you can take from. When you push, a new box appears on top; when you pop, the top box disappears. This picture highlights the “top” as the point of access.
> 
> 1. We have an empty stack. We will push 2, then push 7, pop once, then push 4.
> 2. Push 2 → stack: [2] (top is 2).
> 3. Push 7 → stack: [2, 7] (top is 7).
> 4. Pop → removes 7, leaving [2] (top is now 2).
> 5. Push 4 → stack: [2, 4] (top is 4).
> 6. Check: the next pop would return 4, confirming the LIFO rule.
> 
> After pushing 5 then 8 onto a stack, which element is now on the top?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 5

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 19. Computer science: Programming logic

**Student:** What does this print? total = 0; for i in range(1, 10, 3): total += i; print(total). I don't follow loops.

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 20. Computer science: Computational complexity

**Student:** What is the time complexity of two nested loops that each run n times? Explain Big-O to me.

**Menya** (EXPLAIN, lesson):

> Big‑O tells us how the running time grows when the input size n grows. Think of a recipe that takes a fixed number of steps for each ingredient. If you double the ingredients, the total steps roughly double. That’s a linear relationship, written O(n).
> 
> Imagine a line of people standing in a row. Each person passes a note to the next. The note travels one step per person. The time it takes is proportional to the number of people. The picture would show a straight line of boxes, each with a person, and an arrow moving from left to right.
> 
> 1. Suppose we have two loops, each going from 1 to 3. 2. The outer loop runs 3 times. 3. For each outer iteration, the inner loop runs 3 times. 4. Total iterations = 3 × 3 = 9. 5. If we had 5 instead of 3, we would get 5 × 5 = 25. 6. The pattern shows that the number of steps grows with the square of the number of iterations.
> 
> What is the time complexity of a single loop that runs n times?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** O(n)

**Menya** (GUIDE, guide):

> Correct, a single loop that runs n times has time complexity O(n).
> Now consider two loops where the outer loop runs n times and for each outer iteration the inner loop also runs n times.
> 
> How many total loop iterations are performed when both loops run n times each?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (failed 503):

> (tutor_busy: Menya is very busy right now. Please try again in about 30 seconds. Your message was not counted.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.
