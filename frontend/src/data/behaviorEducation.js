export const behaviorEducation = {
  "Fear-based reactivity": {
    what: "Fear-based reactivity is when a dog responds to triggers with barking, lunging, or growling because they feel threatened and can't escape.",
    causes:
      "Usually develops from insufficient socialization, a scary experience, or genetics. Leash reactivity is common because the leash removes the dog's ability to flee.",
    signs:
      "Stiff body, hackles raised, barking directed at the trigger, pulling toward or away.",
    myth:
      "This is NOT dominance. The dog is not trying to be the boss — they are scared.",
  },
  "Resource guarding": {
    what: "Resource guarding is defensive behavior around food, toys, resting spots, or people the dog values.",
    causes:
      "Common drivers include insecurity about losing valued items, past competition with other animals, and stress in the home environment.",
    signs:
      "Freezing over items, hard stare, stiff posture, lip lift, growling, or snapping when someone approaches.",
    myth:
      "Guarding does not mean the dog is mean or trying to control the household. It is usually anxiety about loss.",
  },
  "Separation anxiety": {
    what: "Separation anxiety is panic or distress when a dog is left alone or separated from attachment people.",
    causes:
      "It often follows sudden routine changes, rehoming, traumatic separation experiences, or a strong dependency pattern.",
    signs:
      "Pacing, drooling, vocalizing, destruction near exits, and accidents that occur mainly when left alone.",
    myth:
      "This is not spite or revenge behavior. The dog is in distress, not trying to punish the owner.",
  },
  "Arousal/impulse dysregulation": {
    what: "Arousal and impulse dysregulation means the dog gets over-threshold quickly and struggles to calm down.",
    causes:
      "Can be linked to chronic stress, under-enrichment, genetics, inconsistent boundaries, and repeated high-excitement patterns.",
    signs:
      "Rapid escalation, mouthing, jumping, inability to settle, and reacting before cues can be processed.",
    myth:
      "This is not simply 'bad behavior.' Many dogs need nervous-system regulation and structured skills, not harsher correction.",
  },
  "Compulsive behavior": {
    what: "Compulsive behavior is repetitive, hard-to-interrupt behavior such as spinning, flank sucking, shadow chasing, or excessive licking.",
    causes:
      "May start from stress and become self-reinforcing over time; medical discomfort and genetic vulnerability can contribute.",
    signs:
      "Repetitive rituals, trance-like focus, difficulty redirecting, and behavior that appears disconnected from context.",
    myth:
      "Compulsive patterns are not just boredom or stubbornness. They can reflect significant emotional or medical needs.",
  },
  "Learned aggression": {
    what: "Learned aggression develops when aggressive behavior has repeatedly worked to create distance or control outcomes.",
    causes:
      "If barking, snapping, or lunging reliably removes triggers, the pattern strengthens. Inconsistent handling can reinforce it.",
    signs:
      "Predictable escalation in similar situations, quick threat displays, and repeated success at pushing people or dogs away.",
    myth:
      "Learned does not mean untreatable. It means the pattern has been reinforced and needs a safer, structured retraining plan.",
  },
  "Redirected frustration": {
    what: "Redirected frustration occurs when a dog cannot reach the trigger and discharges arousal onto a nearby person, dog, or object.",
    causes:
      "Most common when restraint blocks access during high arousal, such as leash barriers, windows, fences, or tight spaces.",
    signs:
      "Sudden biting at leash, handler, or nearby dogs after intense focus on an unreachable target.",
    myth:
      "The dog is usually not targeting you personally. The behavior is a spillover from overwhelming frustration.",
  },
  "Pain-related behavior change": {
    what: "Pain-related behavior change is when discomfort lowers tolerance and changes how a dog responds to handling, movement, or social pressure.",
    causes:
      "Orthopedic pain, dental disease, GI discomfort, skin irritation, or neurologic issues can all drive behavior change.",
    signs:
      "Sudden irritability, reluctance to move, guarding body areas, startle responses, and behavior worsening in specific movements.",
    myth:
      "Behavior problems are not always training issues. Pain and medical factors should be ruled out early.",
  },
};

export function getBehaviorEducation(classification) {
  const c = String(classification || "").trim();
  if (!c) return null;

  if (behaviorEducation[c]) return behaviorEducation[c];

  const lower = c.toLowerCase();
  const key = Object.keys(behaviorEducation).find(
    (k) => lower === k.toLowerCase() || lower.includes(k.toLowerCase())
  );
  return key ? behaviorEducation[key] : null;
}
