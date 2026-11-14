# Menya 5 live evaluation

Run 2026-11-14 14:42 UTC with the production model.

Automatic columns are structural. The last three columns are for a subject teacher: is it correct, is it well taught, would a first-year follow it.

| # | Topic | Lesson taught first | Law or rule named | Arithmetic lines checked / not holding | Wrong answer: step given away | Changed approach | "I don't know": helped | Correct? | Well taught? | Reviewer notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Differentiation | yes | yes | 1 / 0 | no | yes | yes | | | |
| 2 | Integration | yes | n/a | 0 / 0 | no | yes | yes | | | |
| 3 | Differential equations | yes | n/a | 0 / 0 | no | yes | yes | | | |
| 4 | Matrices | yes | n/a | 5 / 0 | no | yes | yes | | | |
| 5 | Probability | yes | n/a | 2 / 0 | no | yes | yes | | | |
| 6 | Complex numbers | yes | n/a | 0 / 0 | no | yes | yes | | | |
| 7 | Newton's laws | yes | yes | 1 / 0 | no | yes | yes | | | |
| 8 | Projectile motion | yes | n/a | 4 / 0 | no | yes | yes | | | |
| 9 | Electricity | yes | yes | 0 / 0 | no | yes | yes | | | |
| 10 | Kirchhoff's laws | yes | yes | 4 / 0 | no | yes | yes | | | |
| 11 | Electromagnetic induction | yes | yes | 1 / 0 | no | yes | yes | | | |
| 12 | Wave mechanics | yes | n/a | 0 / 0 | no | yes | yes | | | |
| 13 | Circuit analysis | yes | n/a | 1 / 0 | no | yes | yes | | | |
| 14 | Signal processing | **no** | yes | 0 / 0 | no | yes | yes | | | |
| 15 | Control systems | yes | n/a | 4 / 0 | no | yes | yes | | | |
| 16 | Semiconductor fundamentals | yes | n/a | 4 / 1 | no | yes | yes | | | |
| 17 | Algorithms | yes | n/a | 1 / 0 | no | yes | yes | | | |
| 18 | Data structures | yes | n/a | 0 / 0 | no | yes | yes | | | |
| 19 | Programming logic | yes | n/a | 4 / 0 | no | yes | yes | | | |
| 20 | Computational complexity | **no** | n/a | 1 / 0 | no | yes | yes | | | |

## 1. Mathematics: Differentiation

**Student:** I don't understand differentiation. Find the derivative of f(x) = 3x^2 + 5x + 4

**Menya** (TEACH, lesson):

> Think of a curve as a hill and the derivative as the steepness of the hill at a point. The derivative tells how fast the function’s value changes with a tiny change in x. It is a single number called the slope of the tangent line.
> 
> The app shows the graph of the function with a point you can slide. A line touching the curve at that point is drawn, and the app displays its slope – the derivative at the current x. Watch how moving the slider changes the slope, and notice the relationship between the point’s position and the displayed number.
> 
> 1. Identify what we know
>  f(x)=2x^3+4x+8 and we need f'(x).
> 2. Differentiate the cubic term
>  Use the power rule d/dx(a·xⁿ)=a·n·xⁿ⁻¹.
>  d/dx(2x^3)=2·3·x^2
> 3. Differentiate the linear term
>  The derivative of b·x is b.
>  d/dx(4x)=4
> 4. Differentiate the constant term
>  The derivative of a constant is 0.
>  d/dx(8)=0
> 5. Combine the results
>  f'(x)=2·3·x^2 + 4 + 0
> 6. Check
>  Substitute x=1: f'(1)=6·1^2+4=10, which matches the slope of the tangent at that point.
> 
> Identify the terms in f(x)=3x^2+5x+4 that you will differentiate.

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 3x

**Menya** (GUIDE, guide):

> The power rule says that the derivative of a·xⁿ is a·n·xⁿ⁻¹. The coefficient a stays, and you multiply it by the exponent n, then lower the exponent by one.
> 
> You correctly identified the term 3x². The only missing step is multiplying 3 by the exponent 2. That gives the correct coefficient.
> 
> What number should you multiply 3 by to get the coefficient of the derivative of 3x²?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Using the power rule, d/dx[3x²] = 3·2·x^(2‑1) = 6x.
> 
> Write the derivative of the next term, 5x, and combine it with the 6x you just obtained.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> Differentiate f(x) = 2x^5 + 4x + 9
> 
> Solve the problem and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 2. Mathematics: Integration

**Student:** I struggle with integration. Evaluate the integral of 6x^2 + 3 from 0 to 2.

**Menya** (TEACH, lesson):

> If you drive at a steady 60 km/h for 2 hours, distance = 60 × 2 = 120 km — a rectangle's area (height × width). Integration is the same idea, but the "height" changes from moment to moment, so you add up many thin rectangles to get the total area under a curve. The tool that lets you do this quickly is the **antiderivative**: a function whose derivative gives you back the original function.
> 
> The graph shows f(x) = 12x² + 6 with the area under the curve shaded between x = 0 and x = 2. The rectangles approximate that shaded area; as you increase their number, the sum of the rectangles gets closer to the true integral. Try dragging the upper-limit slider to x = 3 and watch the shaded region grow — the rectangle sum tracks it.
> 
> 1. Identify what we know
> Evaluate the definite integral of f(x) = 12x^2 + 6 from x = 0 to x = 2.
> Raise each power by one and divide by the new power, then evaluate the antiderivative at the upper limit minus the lower limit.
> 2. Find F(x)
> F(x) = 4x^3 + 6x
> 3. F(2) − F(0)
> 4. Result
> 44

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 54

**Menya** (GUIDE, guide):

> Your answer 54 is not correct. The error comes from treating the integral like multiplying the function value by the interval length, but a definite integral requires finding an antiderivative and then applying the limits.
> 
> What is the antiderivative F(x) of the function f(x)=6x^2+3? Write it in terms of x.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> The antiderivative of f(x)=6x^2+3 is F(x)=2x^3+3x. What is F(2)?
> 
> To find the area under the curve we need a function whose derivative gives the original function; that function is called the antiderivative.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem: Evaluate the definite integral of f(x) = 4x^3 + 4 from x = 0 to x = 3. Solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 3. Mathematics: Differential equations

**Student:** I don't get differential equations. Solve dy/dt = -0.5y with y(0) = 8 and find y(2).

**Menya** (TEACH, lesson):

> A differential equation relates a changing quantity to its rate of change. Here we have a first‑order linear ODE that says the rate of decay of y is proportional to y itself. Solving it gives an exponential function that predicts y at any time.
> 
> The picture would show a curve that starts at the initial value on the vertical axis and falls smoothly as time increases on the horizontal axis. The key point is that the slope at any point equals –0.5 times the current height, which produces the exponential decay.
> 
> 1. Identify what we know
>  Given: dy/dt = –1·y, y(0)=6, want y(2)
> 2. Separate variables
>  Write dy/y = –1 dt
>  Reason: moving all y terms to one side and t terms to the other isolates each variable.
> 3. Integrate both sides
>  ∫(1/y) dy = ∫ –1 dt
>  Reason: integration undoes the differentiation.
> 4. Obtain the logarithmic form
>  ln y = –t + C
>  Reason: the antiderivative of 1/y is ln y and of –1 is –t.
> 5. Exponentiate to solve for y
>  y = e^{–t + C} = e^{C}·e^{–t}
>  Reason: applying the exponential function removes the ln.
> 6. Determine the constant using the initial condition
>  At t=0, y=6 ⇒ 6 = e^{C}
>  ⇒ e^{C}=6
>  Reason: substitute the known point to find C.
> 7. Write the particular solution
>  y = 6·e^{–t}
>  Reason: replace e^{C} with 6.
> 8. Evaluate at t=2
>  y(2) = 6·e^{–2}
>  Reason: plug the requested time into the solution.
> 9. Check
>  Compute 6·e^{–2} ≈ 0.812, which matches the given result.
> 
> Answer the multiple‑choice check the app shows right below, then use the same steps on your own problem.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 0

**Menya** (GUIDE, guide):

> No problem — "0" tells me you're stuck, and that's fine. Let's start from what the equation is actually saying.
> 
> dy/dt = –0.5 y is a sentence in math. In plain words: "The speed at which y is shrinking at any moment is 0.5 times how big y is right now." Bigger y → faster shrinkage; small y → slower shrinkage. That self-referential rule (the rate depends on the current value) is exactly what produces an **exponential** curve.
> 
> So the solution always has the shape
> 
> y = A · e^(–0.5 t)
> 
> where A is a number we haven't found yet. The initial condition y(0) = 8 is the tool that pins down A.
> 
> If you plug t = 0 into y = A · e^(–0.5 t), what do you get on the right-hand side? (Just simplify the expression; don't solve for A yet.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Insert the initial condition y(0)=8: 8 = A·e^{0} so A = 8. The particular solution is therefore y = 8·e^{-0.5 t}. Write the formula for y at t = 2.
> 
> The equation dy/dt = -0.5y leads to an exponential solution of the form y = A·e^{-0.5 t}, where A is a constant.
> 
> What expression do you obtain for y(2) before evaluating it? (e.g., 8·e^{-1})

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> A quantity y(t) obeys dy/dt = −0.2·y with y(0) = 4. Find y(2.5). Give 3 significant figures.
> Solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 4. Mathematics: Matrices

**Student:** Teach me how to multiply matrices. A has rows (1, 2) and (3, 4), B has rows (0, 1) and (5, 2). Find AB.

**Menya** (TEACH, lesson, picture: flow):

> Think of it like pairing up a list of prices with a list of quantities: you multiply each price by its matching quantity, then add everything up. Matrix multiplication does exactly that, but the "lists" are rows of one matrix and columns of the other. Each entry of the result AB is the **dot product** (multiply-and-add) of one row of A with one column of B.
> 
> The flow shows the four moves that produce a single entry. You pick one row from A and one column from B, multiply the first numbers together, multiply the second numbers together, then add those two products. That sum is one entry of AB. You repeat the whole cycle for the other three entries. Notice that the row and column must be the same length (both length 2 here) for the multiplication to work.
> 
> Let A have rows (2, −2) and (2, 0), and B have rows (−2, −3) and (1, −3). We want AB.
> 
> 1. Identify what we know
> A row 1: 2, −2
> A row 2: 2, 0
> B col 1: −2, 1
> B col 2: −3, −3
> We need all four entries of AB.
> 
> 2. Top-left: row 1 of A · col 1 of B
> We pair the first row of A with the first column of B.
> 2·(−2) + (−2)·1
> = −4 + (−2)
> = −6
> 
> 3. Top-right: row 1 of A · col 2 of B
> Same row of A, but now the second column of B.
> 2·(−3) + (−2)·(−3)
> = −6 + 6
> = 0
> 
> 4. Bottom row: row 2 of A with each column of B
> Row 2 of A is (2, 0). The second entry, 0, makes each product on the right vanish, so only the first term survives.
> Bottom-left: 2·(−2) + 0·1 = −4 + 0 = −4
> Bottom-right: 2·(−3) + 0·(−3) = −6 + 0 = −6
> 
> 5. Check
> AB = (−6, 0) on top, (−4, −6) on the bottom.
> Verify top-left another way: the first row of A (2, −2) dotted with the first column of B (−2, 1) gives 2×(−2) = −4 and (−2)×1 = −2; sum is −6. ✓
> 
> Now take your matrices: A has rows (1, 2) and (3, 4); B has rows (0, 1) and (5, 2). Compute the **top-left** entry of AB: multiply the first row of A by the first column of B. What do you get?

Server checks: 5 arithmetic line(s) recomputed; pipeline events: none.

**Student:** (0, 2) and (15, 8)

**Menya** (GUIDE, guide):

> Your answer (0, 2) and (15, 8) does not match the top‑left entry. Remember the top‑left entry comes from the dot product of the first row of A (1, 2) with the first column of B (0, 5).
> 
> Compute 1·0 + 2·5. What number do you obtain?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Compute the first entry of AB: 1×0 + 2×5 = ?
> What is the value of 1×0 + 2×5?
> 
> Matrix multiplication works by taking each row of the first matrix and pairing it with each column of the second matrix. For each pair you multiply the corresponding numbers and add the products.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> A has rows (-3, 5) and (-3, 2). B has rows (0, 1) and (3, 2). Compute the product AB and give its four entries row by row. Please solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 5. Mathematics: Probability

**Student:** Two machines fail independently with probabilities 0.2 and 0.3. What is the probability at least one fails? I never know when to add or multiply.

**Menya** (TEACH, lesson):

> Think of two light switches that can each fail during a shift. The event “at least one fails” means that not both work, i.e., the complement of “neither fails”.
> 
> Imagine two circles, one for “machine 1 fails” and one for “machine 2 fails”. The union of the circles represents “at least one fails”, which is what we need to find.
> 
> 1. Identify what we know
> We are given P(failure 1)=0.25 and P(failure 2)=0.1; we need P(at least one fails).
> 2. Compute probability that neither fails
> Because the machines act independently, the probability both work is the product of their individual “no‑failure” probabilities.
> P(neither)=0.75 × 0.9
> 3. Compute probability at least one fails
> The complement rule says P(at least one)=1−P(neither).
> P(at least one)=1 − P(neither)
> 4. Check
> Substituting the value from step 2 confirms the result.
> 1 − 0.75 × 0.9 = 0.325
> 
> Use the same steps to find the probability that at least one of the two machines fails in your problem.

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 0.5

**Menya** (GUIDE, guide):

> You added 0.2 + 0.3 = 0.5. That works only when the two events **cannot** happen at the same time (mutually exclusive). Here both machines *can* fail together, so adding double-counts that overlap.
> 
> The cleaner route: instead of counting "at least one fails" directly, count the opposite — **neither** fails — and subtract from 1.
> 
> Because the machines are independent, "neither fails" means machine 1 works **and** machine 2 works, so you **multiply** their working probabilities.
> 
> What is P(neither machine fails)? (Hint: P(1 works) = 1 − 0.2, P(2 works) = 1 − 0.3.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Think of the event “neither machine fails” as both machines working.
> 
> If machine 1 works with probability 0.8 and machine 2 works with probability 0.7, the chance that both work is the product of those two numbers.
> 
> Here the working probabilities are 1−0.2 = 0.8 and 1−0.3 = 0.7. 
> P(neither) = 0.8 × 0.7 = ?
> 
> What is the value of 0.8 × 0.7?

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> Two machines work independently. During a shift the first fails with probability 0.2 and the second with probability 0.4. What is the probability that at least one of them fails? Please solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 6. Mathematics: Complex numbers

**Student:** Help me understand multiplying complex numbers: (2 + 3i)(1 - 4i).

**Menya** (TEACH, lesson):

> Multiplying complex numbers is like combining two moves on a map: each number has a length and a direction, and the product gives a new length and a new direction. A complex number a+bi represents the point (a,b) in the plane. The product (a+bi)(c+di) equals (ac‑bd) + (ad+bc)i.
> 
> Picture two arrows from the origin: one for a+bi, one for c+di. When you multiply, the resulting arrow’s length is the product of the two lengths and its angle is the sum of the two angles. The real part comes from multiplying the horizontal components and subtracting the product of the vertical components; the imaginary part mixes the cross terms.
> 
> 1. Identify what we know
> Find the modulus of the complex number z = 7 - 24i.
> |z| = √(a² + b²): the distance of the point (a, b) from the origin of the complex plane.
> 2. Find a² + b²
> a² + b² = 49 + 576
> 3. Find |z|
> |z| = √625
> 4. Result
> 25
> 
> What are the four terms you obtain when you apply the distributive (FOIL) method to (2+3i)(1-4i)?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** -10 - 5i

**Menya** (GUIDE, guide):

> You got the imaginary part right – it’s –5i. The real part comes from ac – bd, not from adding the real parts. For (2+3i)(1-4i) that means 2·1 – 3·(–4). What does that give?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Compute the real part using the formula ac - bd: 2*1 - 3*(-4) = ?
> 
> What does that evaluate to?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> Multiply the complex numbers (3 - 2i)(-4 - 3i). Give the answer in the form x + yi. Please solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 7. Physics: Newton's laws

**Student:** I can't understand Newton's second law. A 5 kg crate is pushed with 16 N against 6 N of friction. What is its acceleration?

**Menya** (TEACH, lesson):

> Newton's second law tells us that a body’s acceleration is produced by the net force acting on it; the larger the net force, the larger the acceleration. In symbols, \(F_{net}=m a\). Here "net force" means the sum of all forces along the direction of motion.
> 
> The interactive diagram shows a block on a floor with three arrows: the applied push, the opposing friction, and the resulting net force. The lengths of the arrows scale with the force magnitudes, and the diagram displays the calculated net force and the resulting acceleration. Move the push‑force slider to see the net force grow and the acceleration increase.
> 
> 1. Identify what we know
> Given: m = 2 kg, applied force = 8 N, friction = 4 N. Need a.
> 2. Determine net force
> Because friction opposes motion, net force = applied – friction.
> F_{net}=8−4
> 3. Compute net force value
> F_{net}=4 N
> 4. Apply Newton's second law
> a = F_{net}/m
> 5. Compute acceleration
> a = 4/2
> 6. Check units and reasonableness
> Result is 2 m/s², a positive acceleration in the direction of the push.
> 
> Select the net force value from the options below, then follow the same steps to find the acceleration of the 5 kg crate.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 3.2 m/s^2

**Menya** (GUIDE, guide):

> You correctly identified that acceleration is the net force divided by mass, but you used the wrong net force. The net force is the applied force minus the friction force. What is the net force acting on the crate?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> The net force is the applied force minus the friction force, so F_{net}=16 N−6 N=10 N.
> 
> Using this net force, what is the crate’s acceleration?

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> A 4 kg crate on a horizontal floor is pushed with a horizontal force of 12 N. A friction force of 6 N opposes the motion. What is the crate's acceleration? Give the unit.
> 
> Solve the problem and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 8. Physics: Projectile motion

**Student:** A ball is launched at 20 m/s at 30 degrees. Find its range. I don't understand projectiles.

**Menya** (TEACH, lesson):

> Imagine throwing a ball across a field. It keeps moving forward at a steady pace while gravity steadily pulls it down. Those two motions happen at the same time but do not affect each other. That independence is the whole trick behind **projectile motion**: the horizontal speed never changes, and only the vertical speed changes (by g each second).
> 
> The simulation draws the parabolic path and displays three numbers: range (horizontal distance), maximum height, and total time in the air. The one relationship to watch is range = horizontal speed × total time. Try sliding the angle from 30° to 60°: the arc gets taller and narrower, but the range stays exactly the same for a fixed launch speed.
> 
> 1. Identify what we know
> A ball is launched from level ground at 20 m/s at 60° above the horizontal. Ignore air resistance and take g = 9.8 m/s². Find its total time in the air. Give 3 significant figures and the unit.
> Split the launch velocity into horizontal (v·cos θ, constant) and vertical (v·sin θ, changed by g) parts; treat the two directions separately.
> 2. Find v_y
> v_y = 20·sin 60° = 17.32 m/s
> 3. Find v_x
> v_x = 20·cos 60° = 10 m/s
> 4. apply the constant-acceleration equations vertically
> 5. Result
> 3.53 s

Server checks: 2 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 20.4 m

**Menya** (GUIDE, guide):

> You gave a number, but you didn't show how you got it. The range depends on both speed and angle, not just speed alone. Next, we need to find the horizontal component of the launch velocity.
> 
> What is the horizontal component of the launch velocity (v_x) for a launch speed of 20 m/s at 30°?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Horizontal component: v_x = 20 cos 30° ≈ 17.3 m/s.
> 
> The horizontal speed stays constant, while the vertical speed changes due to gravity.
> 
> Now find the total time the ball is in the air. (Use the vertical component v_y = 20 sin 30° = 10 m/s and the formula t = 2 v_y / g.) What is t?

Server checks: 2 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> A ball is launched from level ground at 28 m/s at 60° above the horizontal. Ignore air resistance and take g = 9.8 m/s². Find its total time in the air. Give 3 significant figures and the unit.
> 
> Please solve the problem and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 9. Physics: Electricity

**Student:** Explain Ohm's law. A 12 V battery is across a 4 ohm resistor: what current flows?

**Menya** (TEACH, lesson):

> Picture water pushed through a pipe: turn up the pressure and more water flows; make the pipe narrower and the flow drops. Ohm's law says the same for charge in a wire: the current is the voltage divided by the resistance. The one new word is **resistance** – how strongly a component opposes the flow of charge, measured in ohms (Ω).
> 
> The diagram shows a battery, one resistor, and the connecting wire, with a live readout of current and voltage. Watch the single relationship I = V/R: change either slider and the current updates instantly. Drag the voltage slider upward and you will see the current rise in direct proportion while the resistance stays put.
> 
> 1. Identify what we know
> A 2.5 V source is connected across a single 50 Ω resistor. What current flows through the resistor? Give the unit.
> State V = I·R, rearrange to I = V/R, substitute with units, give amperes.
> 2. Find I
> I = V/R
> 3. Find I
> I = 2.5 V / 50 Ω
> 4. Find I
> I = 0.05 A
> 5. Result
> 0.05 A

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 48 A

**Menya** (GUIDE, guide):

> Carry out the step you've just set up and tell me what you get.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Set up the calculation for the given values: I = 12 V / 4 Ω.
> What is the result of this division?
> 
> Ohm's law relates voltage (V), current (I) and resistance (R): V = I·R, so I = V / R.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> A 5 V source is connected across a single 20 Ω resistor. What current flows through the resistor? Give the unit.
> Please solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 10. Physics: Kirchhoff's laws

**Student:** I can't understand Kirchhoff's laws. A 12 V battery is in series with a 2 ohm resistor, then two parallel branches of 3 ohm and 6 ohm. Find the current in each branch.

**Menya** (TEACH, lesson):

> Just like water flowing through pipes, electric current flows through wires. Kirchhoff's laws tell us how the current splits at junctions and how the voltages add up around a closed loop. The current law says the total current entering a node equals the total leaving; the voltage law says the sum of voltage drops around any loop is zero.
> 
> The interactive diagram displays the battery voltage, each resistor, the current in every branch and the voltage across each resistor. It highlights that the sum of voltage drops around the loop equals the battery voltage. Drag the battery slider up: all branch currents increase proportionally.
> 
> 1. Identify what we know
> A 10 V battery is connected to a 8 Ω resistor in series with a parallel pair, R2 = 3 Ω and R3 = 6 Ω. Find the current through R2. Give the unit.
> Combine the parallel pair, add the series resistor, find the total current, then the voltage across the parallel pair (supply minus the series drop, by Kirchhoff's voltage law), then the branch current. Check with Kirchhoff's current law: the branch currents add up to the total.
> 2. Find R_parallel
> R_parallel = 3·6/(3 + 6) = 2 Ω
> 3. Find R_total
> R_total = 8 + 2 = 10 Ω
> 4. Find I_total
> I_total = 10/10 = 1 A
> 5. Find V_parallel
> V_parallel = 10 − 1·8 = 2 V
> 6. Find I_2
> I_2 = 2/3
> 7. Result
> 0.667 A
> 
> Now look at the multiple‑choice check the app shows for the 12 V circuit and pick the correct answer, then apply the same steps to find the branch currents in your circuit.

Server checks: 4 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 4 A and 2 A

**Menya** (GUIDE, guide):

> Kirchhoff's voltage law says the sum of voltage drops around the loop equals the battery voltage. In a series‑parallel circuit, you first find the equivalent resistance of the parallel part, then add the series resistor, then use Ohm's law to get the total current, and finally split that current between the parallel branches using the voltage across them.
> 
> Your answer of 4 A and 2 A doesn't match the circuit. You probably mixed up the series resistor with the parallel branches. The first step is to find the equivalent resistance of the 3 Ω and 6 Ω in parallel.
> 
> What is the equivalent resistance of the 3 Ω and 6 Ω resistors in parallel? (Give the value in Ω.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> For two resistors in parallel, the equivalent resistance is:
> 
> R_parallel = (R₁ × R₂) / (R₁ + R₂)
> 
> Think of it this way: two paths for current means less total resistance than either one alone.
> 
> Plug in your two values: R_parallel = (3 × 6) / (3 + 6). What number do you get for R_parallel?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> A 6 V battery is connected to a 1 Ω resistor in series with a parallel pair, R2 = 6 Ω and R3 = 3 Ω. Find the current through R2. Give the unit.
> 
> Solve the problem and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 11. Physics: Electromagnetic induction

**Student:** Teach me electromagnetic induction. The flux through a 200-turn coil changes by 5 mWb in 100 ms. What emf is induced?

**Menya** (TEACH, lesson):

> Think of a magnet moving through a coil like turning a crank that makes a light bulb glow. The change in magnetic field inside the coil pushes electrons, creating a voltage. This is called electromagnetic induction. The key idea is that a changing magnetic flux produces an electric emf.
> 
> Imagine a coil of wire with a magnet moving through it. The magnetic field lines pass through the coil, and as the magnet moves, the number of lines crossing the coil changes. The coil is the loop, the magnet is the source of field, and the changing flux is the key.
> 
> 1. Identify what we know
>  N = 50 turns
>  ΔΦ = 10 mWb
>  Δt = 100 ms
>  We need the induced emf.
> 2. Convert units
>  ΔΦ = 10 × 10⁻³ Wb
>  Δt = 100 × 10⁻³ s
> 3. Apply Faraday's law
>  |emf| = N·ΔΦ/Δt
> 4. Compute the result
>  |emf| = 50 × (10 × 10⁻³) / (100 × 10⁻³) V
> 5. Check
>  Substitute the numbers back: 50 × 10 × 10⁻³ = 0.5, 100 × 10⁻³ = 0.1, 0.5 / 0.1 = 5 V, units are volts.
> 
> Use the steps above to find the induced emf for your problem.

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 0.05 V

**Menya** (GUIDE, guide):

> Your arithmetic for ΔΦ/Δt is fine: 5 × 10⁻³ Wb ÷ 0.1 s = 0.05 V. That is the emf induced in **one** turn. Your coil has 200 turns, and Faraday's law for a multi-turn coil is
> 
> emf = N · ΔΦ / Δt
> 
> Each turn contributes its own small emf, and they add in series, so you must multiply by N.
> 
> Redo the calculation including the factor N = 200. What emf do you get?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Let's slow down. Which part is unclear: the rule itself, or how to put your own numbers into it? Tell me which, or press "Show a worked example" to see a similar problem solved step by step.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> The magnetic flux through each turn of a 200-turn coil changes uniformly by 5 mWb in 100 ms. What is the magnitude of the induced emf? Give the unit.
> 
> Solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 12. Physics: Wave mechanics

**Student:** I don't understand waves. A wave has frequency 50 Hz and wavelength 2 m. What is its speed?

**Menya** (TEACH, lesson):

> Think of a runner: the number of steps per second (frequency) times the length of each step (wavelength) gives the runner’s speed.
> In waves, the same idea applies: speed equals how many wave crests pass per second multiplied by the distance between crests.
> 
> The app shows a sinusoidal wave moving across the screen. The slider for frequency changes how many crests pass a point each second, while the wavelength slider changes the distance between crests. It highlights the relationship v = f·λ. Try increasing frequency – the wave moves faster; increasing wavelength – the wave also moves faster.
> 
> 1. Identify what we know
> We are given the frequency and wavelength of a wave.
> f = 5 Hz
> λ = 2 m
> We need the speed v.
> 2. Write the governing relationship
> Wave speed is given by the wave‑speed formula.
> v = f·λ
> This follows from the definition of frequency and wavelength.
> 3. Substitute the known values
> v = 5 Hz × 2 m
> 4. Perform the multiplication
> v = 10 m·Hz
> Since 1 Hz = 1 s⁻¹, this simplifies to
> v = 10 m/s
> 5. Check the result
> The unit m/s is a speed unit, and the magnitude is reasonable for a mechanical wave.
> 
> Use the same steps to find the speed for a wave with frequency 50 Hz and wavelength 2 m.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 25 m/s

**Menya** (GUIDE, guide):

> 25 m/s is not right. You divided 50 by 2, but the wave-speed formula is a multiplication: v = f × λ. Think of it this way – more crests per second **and** longer crests each means the wave covers more ground per second, so the two quantities multiply, not divide.
> 
> Redo the calculation: 50 Hz × 2 m = ?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Substituting the given values gives v = 50 Hz × 2 m = ?
> 
> Wave speed is found by multiplying frequency and wavelength: v = f·λ.
> 
> What is the product 50 × 2?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> A wave travels at 187.5 m/s with frequency 250 Hz. What is its wavelength? Give the unit.
> 
> Solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 13. Engineering: Circuit analysis

**Student:** A 9 V supply feeds 1 kilo-ohm in series with 2 kilo-ohm. What is the voltage across the 2 kilo-ohm resistor? I don't get voltage dividers.

**Menya** (TEACH, lesson):

> A water pipe that narrows splits the pressure: the narrower part gets less pressure, the wider part more. In circuits the supply voltage is split between series resistors in proportion to their resistances. This is called a voltage divider.
> 
> The interactive diagram shows the battery voltage, the two resistors, the current flowing through the loop, and the voltage drop on each resistor. It highlights Kirchhoff's voltage law (the sum of drops equals the source) and Kirchhoff's current law (the same current passes both resistors). Drag a resistor’s slider: increasing its resistance raises its voltage drop while the other drop falls.
> 
> 1. Identify what we know
> A 5 V supply feeds R1 = 2 kΩ in series with R2 = 10 kΩ. What is the voltage across R2?
> Vout = V·R2/(R1+R2); same current through both resistors.
> 2. Find I
> I = V/(R1 + R2)
> 3. Find V2
> V2 = I·R2
> 4. Result
> 4.17 V
> 
> Check the app’s multiple‑choice question and then apply the same steps to your 9 V circuit.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 3 V

**Menya** (GUIDE, guide):

> Not quite. The most common slip here is putting the **wrong resistor in the numerator**. The rule is: the resistor you want the voltage *across* goes on top. You want the voltage across the 2 kΩ, so that's the one in the numerator — not the 1 kΩ.
> 
> If you used 1 kΩ on top you'd get 9 × 1/3 = 3 V, which is the voltage across the *other* resistor.
> 
> Re-apply the formula V_out = V × R_target / (R1 + R2) with R_target = 2 kΩ. What do you get?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Apply the same steps to your circuit: total resistance R_total = 1 kΩ + 2 kΩ = 3 kΩ. Write the expression for the voltage across the 2 kΩ resistor using V_source = 9 V.
> 
> The voltage‑divider rule says V_out = V_source × R_target / (R_total). The step you need is to write the expression with the correct resistor in the numerator.
> 
> For a 5 V source with R1 = 2 kΩ and R2 = 10 kΩ, the voltage across R2 is V_out = 5 V × 10 kΩ / (2 kΩ + 10 kΩ). You first add the resistances, then place the resistor you want the voltage across on top.
> 
> What is the expression for V_out before you calculate the numeric value?

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> A 9 V supply feeds R1 = 4.7 kΩ in series with R2 = 3.3 kΩ. What is the voltage across R2?
> 
> Please solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 14. Engineering: Signal processing

**Student:** What sampling rate do I need for a signal with components at 1.2 kHz and 3.5 kHz? Explain why.

**Menya** (TEACH, lesson):

> The Nyquist rate is twice the highest frequency present in the signal. In your case the highest component is 3.5 kHz, so the sampling rate must be at least 2 × 3.5 kHz. What is that value?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 3.5 kHz

**Menya** (GUIDE, guide):

> You correctly identified the highest frequency component (3.5 kHz), but the sampling rate must be twice that value.
> 
> What is twice 3.5 kHz? Give the sampling rate in kHz.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> The Nyquist criterion says the sampling rate f_s must be at least twice the highest frequency component: f_s = 2 × f_max. Here the highest component is 3.5 kHz, so set up the calculation f_s = 2 × 3.5 kHz = ?
> 
> What is the value of 2 × 3.5 kHz? Give your answer in kHz.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> A signal contains sinusoidal components at 1.5 kHz, 0.3 kHz and 2.5 kHz. What is the minimum sampling rate that avoids aliasing (the Nyquist rate)? Answer in kHz. Please solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 15. Engineering: Control systems

**Student:** A unity feedback loop has G(s) = 9/(2s + 1). What is the steady-state output for a step of 10? I don't understand feedback.

**Menya** (TEACH, lesson):

> In everyday life, a thermostat keeps a room at a set temperature by comparing the current temperature to the desired one and adjusting the heater. The same idea is used in electronics: the system (plant) produces an output, the feedback loop measures it, and the controller adjusts the input so the output matches the reference.
> 
> The diagram shows a block that represents the plant G(s), a summing junction that subtracts the feedback from the reference, and a second block that represents the feedback path. The output of G(s) is fed back and subtracted from the reference, producing the error that drives the plant.
> 
> 1. Identify what we know
> The plant transfer function is G(s)=3/(2s+1).
> The input step size is 2.
> We need the steady‑state output y_ss.
> 2. Compute G(0)
> G(0)=3/(2·0+1)=3.
> 3. Compute the closed‑loop transfer function at s=0
> T(0)=G(0)/(1+G(0))=3/(1+3)=0.75.
> 4. Apply the final value theorem for a step input
> y_ss = step size × T(0) = 2 × 0.75 = 1.5.
> 5. Check
> Substituting s=0 into the full closed‑loop transfer function gives the same 0.75 factor, and multiplying by the step size 2 yields 1.5, confirming the result.
> 
> Use the same steps to find the steady‑state output for the new plant G(s)=9/(2s+1) with a step of 10.

Server checks: 3 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 90

**Menya** (GUIDE, guide):

> You correctly identified that we need a steady‑state value, but the number 90 comes from multiplying the step size (10) by the DC gain incorrectly; the DC gain of the closed‑loop system is not 9.
> 
> First, compute the plant’s DC gain G(0). What is G(s) evaluated at s = 0?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Your answer of 90 used the open-loop gain: 10 × 9. But in a unity feedback loop the output is fed back and subtracted from the input, so the effective gain is smaller. The closed-loop DC gain is
> 
> T(0) = G(0) / (1 + G(0))
> 
> I'll do the first step for you. The plant is G(s) = 9/(2s + 1), so at s = 0:
> 
> G(0) = 9 / (2·0 + 1) = 9
> 
> Now plug that into the formula. What is T(0) = 9 / (1 + 9)?

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> A unity negative-feedback loop has forward transfer function G(s) = 19/(5s + 1). The reference input is a step of size 5. What is the steady-state value of the output? Solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 16. Engineering: Semiconductor fundamentals

**Student:** A silicon diode is in series with a 1000 ohm resistor across 5 V. What current flows? Why is it not 5 mA?

**Menya** (TEACH, lesson):

> In a simple series circuit the current is the same through every component. The voltage from the supply is split between the diode and the resistor. The diode keeps a fixed drop of about 0.7 V, so the rest of the supply appears across the resistor. That remaining voltage determines the current.
> 
> null
> 
> 1. Identify what we know
>  V_supply = 5 V
>  V_diode = 0.7 V
>  R = 2200 Ω
>  We need I.
> 2. Calculate the voltage across the resistor
>  V_R = V_supply – V_diode
>  5 – 0.7 = 4.3 V
>  The resistor sees 4.3 V.
> 3. Apply Ohm’s law to find current
>  I = V_R / R
>  4.3 / 2200 = 0.0019545 A
> 4. Convert to milliamps
>  0.0019545 A × 1000 = 1.95 mA
>  Check: 1.95 mA × 2200 Ω = 4.3 V, which plus 0.7 V gives 5 V.
> 
> Answer the multiple‑choice check the app shows right below, then use the same steps on your 1000 Ω problem.

Server checks: 4 arithmetic line(s) recomputed, **1 do not hold**: «0.0019545 A × 1000 = 1.95 mA»; shown to the student as not confirmed; pipeline events: arithmetic_mismatch, arithmetic_unverified.

**Student:** 5 mA

**Menya** (GUIDE, guide):

> You used 5 mA, which would be the current if the whole 5 V dropped across the resistor. The diode keeps about 0.7 V across itself, so the resistor only sees the remaining voltage.
> 
> What is the voltage across the resistor?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Let's slow down. Which part is unclear: the rule itself, or how to put your own numbers into it? Tell me which, or press "Show a worked example" to see a similar problem solved step by step.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> A silicon diode (forward voltage 0.7 V) is forward biased in series with a 1000 Ω resistor across a 3 V supply. What current flows? Answer in mA.
> 
> Please solve the problem and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 17. Computer science: Algorithms

**Student:** How many elements does binary search examine in the worst case for 1000 sorted elements? Teach me why.

**Menya** (TEACH, lesson, picture: array):

> Imagine looking for a name in a phone book. You open to the middle, see the name is earlier, and throw away the whole back half. One flip cuts your search space in two. Binary search does exactly that: each step examines the middle of the remaining range and discards half.
> 
> The picture shows a sorted row of 31 cells. In row 1 the middle cell is highlighted; in row 2 the left half is dimmed and the new middle of the right half is highlighted; row 3 repeats the cut. Notice that after every highlight the live range is half as long as before. That shrinking-by-half is why the step count grows so slowly: doubling the array adds only one more step.
> 
> 1. Identify what we know
> n = 31
> Each step halves the remaining range
> We need: worst-case number of elements examined
> 
> 2. Count the halvings
> Each step cuts the range in two, so we ask how many times 31 can be halved down to 1.
> ⌊log₂ 31⌋ = 4
> 
> 3. Add the final element
> After 4 halvings the range is 1 element, which we still examine.
> Total = 4 + 1 = 5
> 
> 4. Check
> Trace the range: 31 → 15 → 7 → 3 → 1 → (empty)
> 5 examinations, range is now empty. ✓
> 
> Answer the multiple-choice check shown below, then apply the same two steps (⌊log₂ n⌋ + 1) to your own value of n = 1000.

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 1000

**Menya** (GUIDE, guide):

> Binary search cuts the search space in half each time. After the first comparison you discard about half of the remaining elements, then half of the rest, and so on. The number of comparisons you need is the number of times you can halve the list until only one element remains, plus the final comparison of that last element.
> 
> You correctly identified that the array has 1000 elements, but you still need to find how many times you can halve 1000 until you reach 1 or less.
> 
> How many times can you divide 1000 by 2 until the result is 1 or less? (This is the same as asking for the largest integer k such that 2^k ≤ 1000.)

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> What is the largest integer k such that 2^k ≤ 1000? (This k is the ⌊log₂ 1000⌋ you need to compute.)
> 
> Binary search cuts the list in half each time. After k steps you have reduced the list to size n / 2^k. When that size becomes 1 or less you have examined all necessary elements.
> 
> Take n = 31.
> Step 1: 31 → 15
> Step 2: 15 → 7
> Step 3: 7 → 3
> Step 4: 3 → 1
> Step 5: examine the last element.
> So 5 steps = ⌊log₂ 31⌋ + 1.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> Binary search runs on a sorted array of 2000 elements. Each step examines the middle element of the remaining range and discards half of it. In the worst case, how many elements are examined before the search ends?
> 
> Please solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 18. Computer science: Data structures

**Student:** I confuse stacks and queues. If I push 5, push 8, pop, push 3, what does the next pop return?

**Menya** (TEACH, lesson, picture: array):

> A stack is like a pile of plates on a table. You can only place a new plate on top, and you can only lift the top plate off. The last plate you set down is the first one you remove. That rule — last in, first out (LIFO) — is what makes a stack different from a queue, where the first item in is the first one out.
> 
> The diagram shows the stack after each operation. The highlighted cell is always the top: the only place you can add or remove. Watch what happens at each pop — the highlighted cell disappears and the cell below it becomes the new top. That single rule (always touch the top) is the whole trick.
> 
> 1. Identify what we know
> Starting with an empty queue, these operations run in order: enqueue(8), enqueue(6), enqueue(11), dequeue(), enqueue(14), enqueue(3), dequeue(), dequeue(). What value does the last dequeue() return?
> A queue is first in, first out: each dequeue removes the oldest value still held.
> 2. write the contents after each operation
> 3. the last dequeue() removes the oldest value held
> 4. Result
> 11
> 
> Now trace your own sequence (push 5, push 8, pop, push 3, pop) the same way and tell me what the final pop returns.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 5

**Menya** (GUIDE, guide):

> You treated the stack as if it were a queue; a stack removes the most recently added item (LIFO), not the earliest one.
> 
> After the first pop removed 8, what element is now on top of the stack before the next pop?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Let's trace your sequence step by step. The rule for a stack: **pop always removes the top** (the most recently pushed item).
> 
> 1. push 5 → stack: [5] ← top
> 2. push 8 → stack: [5, 8] ← top
> 3. pop → removes 8. Stack: [5] ← top
> 4. push 3 → stack: [5, 3] ← top
> 
> Now it's your turn for the last step.
> 
> The top is 3. What does the next pop return?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> Starting with an empty queue, these operations run in order: enqueue(15), enqueue(7), enqueue(10), dequeue(), enqueue(2), enqueue(17), dequeue(), dequeue(). What value does the last dequeue() return?
> 
> Solve it and show your working (write the queue after each step).

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 19. Computer science: Programming logic

**Student:** What does this print? total = 0; for i in range(1, 10, 3): total += i; print(total). I don't follow loops.

**Menya** (TEACH, lesson, picture: array):

> Think of a for-loop as a conveyor belt: a machine hands you one value at a time, you do a small job with it, then the next value arrives. In Python, range(start, stop, step) is the machine — it hands out numbers starting at start, jumping by step each time, and stops before it reaches stop. The loop body (the indented line) runs once for every value the machine hands out.
> 
> Look at the number line above. The grey cells are numbers the machine skips; the highlighted cells (1, 4, 7) are the only values your loop will ever see. Notice that 10 itself is never handed out — the machine stops just short of stop. That is the one thing that trips people up: stop is a fence, not a target.
> 
> Let's trace a different loop so the pattern is clear:
> 
> 1. Identify what we know
>  total = 0
>  range(2, 8, 3) → start = 2, stop = 8, step = 3
>  We need: the value printed at the end.
> 
> 2. List the values the machine hands out
>  Start at 2, add 3 each time, stop before 8:
>  2, 5
>  (next would be 8, but 8 is not less than 8, so we stop)
> 
> 3. Run the body for each value
>  i = 2 → total = 0 + 2 = 2
>  i = 5 → total = 2 + 5 = 7
> 
> 4. Print the result
>  print(total) → 7
> 
> 5. Check
>  The only values added were 2 and 5; 2 + 5 = 7. ✓
> 
> Now do the same for your code. First step only: list the three values that range(1, 10, 3) hands out, in order.

Server checks: 3 arithmetic line(s) recomputed; pipeline events: none.

**Student:** 22

**Menya** (GUIDE, guide):

> You jumped straight to a total, which tells me you're trying to get to the end. That's fine, but we need the list first. The number 22 looks like 1 + 4 + 7 + 10, which means you may have included 10 in the sequence. Here's the key rule: **range stops before the stop value**. It never hands out 10.
> 
> A tiny check: range(1, 5, 2) gives 1, 3. The next would be 5, but 5 is the stop, so it's excluded.
> 
> Now just list the values range(1, 10, 3) hands out, separated by commas. Don't add them yet — just the list.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> Range(start, stop, step) builds a list like this: the first number is start. Each next number is the previous one plus step. You keep going only while the next number is strictly less than stop.
> 
> In your code: start = 1, stop = 10, step = 3. So you begin at 1, keep adding 3, and you must stop before you reach 10.
> 
> Let me do the first two for you:
> - First value: 1 (that is the start)
> - Second value: 1 + 3 = 4
> 
> What is the third value? And would a fourth value be included, or does it hit the stop?

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, feedback):

> You got the first two values right (1 and 4), which shows the pattern is clicking: start, then keep adding the step, stop before the stop value.
> 
> Here is one to try on your own:
> 
> What values does `range(3, 15, 4)` hand out? Just list them, separated by commas.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

## 20. Computer science: Computational complexity

**Student:** What is the time complexity of two nested loops that each run n times? Explain Big-O to me.

**Menya** (EXPLAIN, lesson):

> Which idea or formula links the quantities you're given, and how would you start?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** O(n)

**Menya** (GUIDE, guide):

> You correctly identified that loops involve O(n) work, but you missed that there are two loops.
> 
> How many times does the inner loop run for each iteration of the outer loop?

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.

**Student:** I don't know

**Menya** (HINT, guide):

> The key idea with nested loops: the inner loop runs fully for every single pass of the outer loop.
> 
> Small example, n = 3:
> - Outer pass 1 → inner runs 3 times
> - Outer pass 2 → inner runs 3 times
> - Outer pass 3 → inner runs 3 times
> Total inner runs: 3 + 3 + 3 = 9, which is 3 × 3.
> 
> Now your loops: the outer loop runs n times, and for each one the inner loop runs n times. So the total number of inner-loop executions is n × n.
> 
> What is O(n × n) written in simplest Big-O form?

Server checks: 1 arithmetic line(s) recomputed; pipeline events: none.

**Student:** Give me a harder problem

**Menya** (PRACTISE, plain):

> Practice problem
> 
> What is the time complexity (Big-O, in terms of n) of this code?
> 
> ```python
> for i in range(n):
>     count += 1
> for j in range(n):
>     count += 1
> ```
> 
> Solve it and show your working.

Server checks: 0 arithmetic line(s) recomputed; pipeline events: none.
