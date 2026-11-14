// Interface text added with Menya 5 (stages, notebook, diagnostic, readiness, exam marks).
// English is complete. French covers the labels a fluent reviewer still has to check.
// Kinyarwanda and Kiswahili fall back to English here on purpose: no fluent speaker has
// written these, and a wrong translation is worse than an English label.
export const EN5 = {
  "intro.1b": "It teaches before it asks.", "intro.1": "You get the idea, a picture and a worked example first, then one question to try.",
  "data.guest": "This conversation is kept in this browser while you try Menya. Create a free account to keep it.",
  "chip.help": "Hint",
  "menu.notebook": "Revision notebook", "companion.notebook": "Notebook",
  "bank.subject.physics": "Physics", "bank.subject.engineering": "Engineering",

  "obj.calc.integration_power": "Integrating polynomials", "obj.calc.integration_substitution": "Integration by substitution",
  "obj.calc.first_order_ode": "First-order differential equations", "obj.linalg.determinants": "Determinants (2×2)",
  "obj.linalg.matrix_multiplication": "Matrix multiplication", "obj.prob.independent_events": "Independent events",
  "obj.prob.binomial_distribution": "The binomial distribution", "obj.math.complex_numbers": "Complex numbers",
  "obj.phys.newtons_second_law": "Newton's second law", "obj.phys.projectile_motion": "Projectile motion", "obj.phys.wave_speed": "Wave speed",
  "obj.phys.electromagnetic_induction": "Faraday's law of induction", "obj.ee.kirchhoff_laws": "Kirchhoff's laws",
  "obj.semi.diode_circuits": "Diode circuits", "obj.sig.sampling": "Sampling and the Nyquist rate",
  "obj.ctrl.feedback_steady_state": "Feedback: steady-state output", "obj.ds.stacks_queues": "Stacks and queues", "obj.algo.binary_search": "Binary search",

  "stage.label": "Stage",
  "stage.not_started": "not started", "stage.exposure": "met", "stage.understanding": "solved with help",
  "stage.application": "solved alone", "stage.retention": "remembered after a break", "stage.mastery": "mastered (provisional)",
  "stage.short.exposure": "Met", "stage.short.understanding": "With help", "stage.short.application": "Alone",
  "stage.short.retention": "After a break", "stage.short.mastery": "Mastered",
  "stage.note": "Stages come only from answers Menya marked itself. Following an explanation doesn't move a topic on; solving does.",
  "evidence.learn": "Next: learn it and try a first problem", "evidence.solve_guided": "Next: solve one, with help if you need it",
  "evidence.solve_alone": "Next: solve an unseen problem without help", "evidence.solve_after_break": "Next: solve one again after two days or more",
  "evidence.stay_consistent": "Next: keep getting unseen problems right", "evidence.keep_reviewing": "Next: review it when it comes due",
  "support.1": "full guidance", "support.2": "lighter guidance", "support.3": "working independently",

  "accuracy.example": "The numbers in this worked example were computed by Menya, not by the AI model.",
  "accuracy.title": "Not confirmed",
  "accuracy.note": "Menya recomputed the numbers in this reply and could not confirm this line. Work through it yourself before relying on it:",

  "study.diagnose": "Check what I know first", "study.learn": "Teach me",
  "ready.title": "What your answers show",
  "ready.state.secure": "secure: solved alone, including after a break", "ready.state.forgetting": "was secure, but its review is more than a week overdue",
  "ready.state.not_yet_retained": "solved alone, not yet again after a break", "ready.state.guided_only": "solved only with help so far",
  "ready.state.weak": "more wrong than right so far", "ready.state.not_tested": "not tested yet",
  "ready.first": "Work on these first", "ready.mistake": "repeated mistake",
  "ready.note": "This describes the answers Menya has marked. It is not a prediction of your result.",

  "diag.title": "Diagnostic",
  "diag.sub": "A few questions on what this topic depends on, then the topic itself. Untimed. It shows where to start.",
  "diag.startAt": "Start with {topic}: that is the earliest question you missed.",
  "diag.allRight": "Every answer was right. You're ready for harder problems on {topic}.",
  "diag.secure": "Answered correctly", "diag.learn": "Teach me {topic}", "diag.practise": "Give me a problem on {topic}",

  "exam.marksLabel": "marks", "exam.marksOf": "{a} of {m} marks",
  "exam.method": "Working: {found} of {total} intermediate results found.",
  "exam.methodNote": "Marks for working are estimated from the intermediate results in what you wrote. Reasoning written without its numbers isn't recognised, so treat them as a guide.",
  "exam.previous": "Last time on this exam: {correct}/{total} correct", "exam.previousMarks": ", {a} of {m} marks",
  "exam.loadTopics": "Loading topics…",

  "notebook.title": "Revision notebook",
  "notebook.sub": "A formula card, the stage you've reached and the mistakes Menya has seen from you, for every topic you've met.",
  "notebook.empty": "Nothing here yet. A topic appears once you've answered a checked question on it or added it to an exam.",
  "notebook.start": "Open My study",
  "notebook.filterAll": "All topics", "notebook.filterDue": "Due now", "notebook.filterSlipped": "Slipped",
  "notebook.recallFirst": "Answer from memory, then turn the card:",
  "notebook.show": "Turn the card", "notebook.hide": "Hide the card",
  "notebook.symbols": "What the symbols mean", "notebook.use": "When to use it", "notebook.conditions": "Conditions",
  "notebook.origin": "Where it comes from", "notebook.mistake": "Common mistake",
  "notebook.test": "Test me with a new problem", "notebook.mistakes": "Mistakes Menya has seen from you", "notebook.times": "{n}×",
  "notebook.due": "due for review", "notebook.dueOn": "next review {date}", "notebook.slipped": "slipped since you last got it right",
  "notebook.noCard": "No formula card for this topic yet.", "notebook.lab": "Try it yourself",
  "notebook.note": "Turning a card doesn't count as knowing it. Only a new problem solved without help moves a topic on.",

  "lab.projectile.title": "Change the launch and watch the path",
  "lab.projectile.speed": "Launch speed", "lab.projectile.angle": "Angle", "lab.projectile.gravity": "Gravity g",
  "lab.projectile.range": "Range", "lab.projectile.height": "Maximum height", "lab.projectile.time": "Time in the air",
  "lab.projectile.alt": "Path of a projectile launched at {v} metres per second at {a} degrees: range {r} metres, maximum height {h} metres.",
  "lab.projectile.note": "No air resistance, level ground. Notice that 30° and 60° give the same range, and that halving g doubles it.",
};

export const FR5 = {
  "intro.1b": "Il explique avant de questionner.", "intro.1": "Vous voyez d'abord l'idée, un schéma et un exemple résolu, puis une seule question à essayer.",
  "menu.notebook": "Carnet de révision", "companion.notebook": "Carnet", "notebook.title": "Carnet de révision",
  "bank.subject.physics": "Physique", "bank.subject.engineering": "Ingénierie",
  "stage.label": "Étape",
  "stage.not_started": "non commencé", "stage.exposure": "découvert", "stage.understanding": "résolu avec aide",
  "stage.application": "résolu seul", "stage.retention": "retenu après une pause", "stage.mastery": "maîtrisé (provisoire)",
  "obj.calc.integration_power": "Intégration des polynômes", "obj.calc.integration_substitution": "Intégration par changement de variable",
  "obj.calc.first_order_ode": "Équations différentielles du premier ordre", "obj.linalg.determinants": "Déterminants (2×2)",
  "obj.linalg.matrix_multiplication": "Produit de matrices", "obj.prob.independent_events": "Événements indépendants",
  "obj.prob.binomial_distribution": "Loi binomiale", "obj.math.complex_numbers": "Nombres complexes",
  "obj.phys.newtons_second_law": "Deuxième loi de Newton", "obj.phys.projectile_motion": "Mouvement d'un projectile", "obj.phys.wave_speed": "Vitesse d'une onde",
  "obj.phys.electromagnetic_induction": "Loi de Faraday", "obj.ee.kirchhoff_laws": "Lois de Kirchhoff",
  "obj.semi.diode_circuits": "Circuits à diode", "obj.sig.sampling": "Échantillonnage et fréquence de Nyquist",
  "obj.ctrl.feedback_steady_state": "Boucle fermée : régime permanent", "obj.ds.stacks_queues": "Piles et files", "obj.algo.binary_search": "Recherche dichotomique",

  "data.guest": "Cette conversation est gardée dans ce navigateur pendant votre essai de Menya. Créez un compte gratuit pour la conserver.",
  "chip.help": "Indice",
  "stage.short.exposure": "Découvert", "stage.short.understanding": "Avec aide", "stage.short.application": "Seul",
  "stage.short.retention": "Après une pause", "stage.short.mastery": "Maîtrisé",
  "stage.note": "Les étapes viennent uniquement des réponses que Menya a corrigées. Suivre une explication ne fait pas avancer un sujet ; résoudre, oui.",
  "evidence.learn": "Ensuite : l'apprendre et essayer un premier problème", "evidence.solve_guided": "Ensuite : en résoudre un, avec de l'aide si besoin",
  "evidence.solve_alone": "Ensuite : résoudre un problème nouveau sans aide", "evidence.solve_after_break": "Ensuite : en résoudre un autre après deux jours ou plus",
  "evidence.stay_consistent": "Ensuite : continuer à réussir des problèmes nouveaux", "evidence.keep_reviewing": "Ensuite : le réviser à la date prévue",
  "support.1": "guidage complet", "support.2": "guidage allégé", "support.3": "travail autonome",

  "accuracy.example": "Les nombres de cet exemple résolu ont été calculés par Menya, et non par le modèle d'IA.",
  "accuracy.title": "Non confirmé",
  "accuracy.note": "Menya a recalculé les nombres de cette réponse et n'a pas pu confirmer cette ligne. Refaites le calcul vous-même avant de vous y fier :",

  "study.diagnose": "Vérifier d'abord ce que je sais", "study.learn": "Apprends-moi",
  "ready.title": "Ce que montrent vos réponses",
  "ready.state.secure": "acquis : résolu seul, y compris après une pause", "ready.state.forgetting": "était acquis, mais la révision a plus d'une semaine de retard",
  "ready.state.not_yet_retained": "résolu seul, pas encore après une pause", "ready.state.guided_only": "résolu seulement avec aide pour l'instant",
  "ready.state.weak": "plus d'erreurs que de réussites pour l'instant", "ready.state.not_tested": "pas encore testé",
  "ready.first": "À travailler en premier", "ready.mistake": "erreur répétée",
  "ready.note": "Ceci décrit les réponses que Menya a corrigées. Ce n'est pas une prévision de votre résultat.",

  "diag.title": "Diagnostic",
  "diag.sub": "Quelques questions sur ce dont ce sujet dépend, puis sur le sujet lui-même. Sans limite de temps. Il montre par où commencer.",
  "diag.startAt": "Commencez par {topic} : c'est la première question manquée.",
  "diag.allRight": "Toutes les réponses étaient justes. Vous êtes prêt pour des problèmes plus difficiles sur {topic}.",
  "diag.secure": "Réponses justes", "diag.learn": "Apprends-moi {topic}", "diag.practise": "Donne-moi un problème sur {topic}",

  "exam.marksLabel": "points", "exam.marksOf": "{a} points sur {m}",
  "exam.method": "Démarche : {found} résultats intermédiaires trouvés sur {total}.",
  "exam.methodNote": "Les points de démarche sont estimés à partir des résultats intermédiaires que vous avez écrits. Un raisonnement rédigé sans ses nombres n'est pas reconnu : prenez-les comme une indication.",
  "exam.previous": "La dernière fois à cet examen : {correct}/{total} justes", "exam.previousMarks": ", {a} points sur {m}",
  "exam.loadTopics": "Chargement des sujets…",

  "notebook.sub": "Une fiche de formule, l'étape atteinte et les erreurs que Menya a vues chez vous, pour chaque sujet rencontré.",
  "notebook.empty": "Rien ici pour l'instant. Un sujet apparaît dès que vous avez répondu à une question corrigée ou que vous l'avez ajouté à un examen.",
  "notebook.start": "Ouvrir Mes études",
  "notebook.filterAll": "Tous les sujets", "notebook.filterDue": "À réviser maintenant", "notebook.filterSlipped": "En recul",
  "notebook.recallFirst": "Répondez de mémoire, puis retournez la fiche :",
  "notebook.show": "Retourner la fiche", "notebook.hide": "Cacher la fiche",
  "notebook.symbols": "Signification des symboles", "notebook.use": "Quand l'utiliser", "notebook.conditions": "Conditions",
  "notebook.origin": "D'où elle vient", "notebook.mistake": "Erreur fréquente",
  "notebook.test": "Teste-moi avec un nouveau problème", "notebook.mistakes": "Erreurs que Menya a vues chez vous", "notebook.times": "{n}×",
  "notebook.due": "à réviser", "notebook.dueOn": "prochaine révision le {date}", "notebook.slipped": "en recul depuis la dernière réussite",
  "notebook.noCard": "Pas encore de fiche de formule pour ce sujet.", "notebook.lab": "Essayez vous-même",
  "notebook.note": "Retourner une fiche ne compte pas comme la connaître. Seul un nouveau problème résolu sans aide fait avancer un sujet.",

  "lab.projectile.title": "Changez le lancer et observez la trajectoire",
  "lab.projectile.speed": "Vitesse de lancement", "lab.projectile.angle": "Angle", "lab.projectile.gravity": "Pesanteur g",
  "lab.projectile.range": "Portée", "lab.projectile.height": "Hauteur maximale", "lab.projectile.time": "Durée du vol",
  "lab.projectile.alt": "Trajectoire d'un projectile lancé à {v} mètres par seconde sous un angle de {a} degrés : portée {r} mètres, hauteur maximale {h} mètres.",
  "lab.projectile.note": "Sans résistance de l'air, sol horizontal. Remarquez que 30° et 60° donnent la même portée, et que diviser g par deux la double.",
};

// Text that described the old behaviour ("it asks before it tells") and has no checked replacement in these languages.
export const STALE = { rw: ["intro.1b", "intro.1"], sw: ["intro.1b", "intro.1"] };

// Strings shown in English in these languages until a fluent speaker writes them. Listed, so the
// translation test can tell "waiting for a translator" from "forgotten".
export const PENDING_TRANSLATION = { rw: Object.keys(EN5), sw: Object.keys(EN5) };
