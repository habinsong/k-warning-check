export interface EnglishAiHookingPatternSet {
  weakPatterns: RegExp[]
  strongPatterns?: RegExp[]
}

export const ENGLISH_AI_HOOKING_PATTERNS: Record<string, EnglishAiHookingPatternSet> = {
  'ai-hook-001': {
    weakPatterns: [
      /\bclaude\s*3\.5\s*sonnet\b/iu,
      /\bclaude\s*3\.7\s*sonnet\b/iu,
      /\bgpt-?4\b.*\b(?:latest|best|current flagship)\b/iu,
      /\bgemini\s*1\.5\b.*\b(?:latest|best)\b/iu,
    ],
    strongPatterns: [/\bclaude\s*3\.5\s*sonnet\b.*\b(?:latest|best|flagship)\b/iu],
  },
  'ai-hook-002': {
    weakPatterns: [
      /\boutdated .* still the best\b/iu,
      /\bold .* still the flagship\b/iu,
      /\bclaude\s*3\.5\b.*\btop\b/iu,
    ],
    strongPatterns: [/\bclaude\s*3\.5\b.*\b(?:best|strongest|top)\b/iu],
  },
  'ai-hook-004': {
    weakPatterns: [
      /\bnow everyone uses this\b/iu,
      /\bthese days everyone uses\b/iu,
      /\bthe industry already moved\b/iu,
    ],
    strongPatterns: [/\bevery serious team already uses this\b/iu],
  },
  'ai-hook-011': {
    weakPatterns: [/\bno source\b/iu, /\bno evidence\b/iu, /\btrust me\b/iu],
    strongPatterns: [/\bno source\b.*\bperformance\b/iu],
  },
  'ai-hook-012': {
    weakPatterns: [
      /\b4b speed .* 26b performance\b/iu,
      /\bbenchmark\b/iu,
      /\bwithout benchmark conditions\b/iu,
    ],
    strongPatterns: [/\b4b speed .* 26b performance\b/iu],
  },
  'ai-hook-013': {
    weakPatterns: [
      /\breal teams\b/iu,
      /\benterprise teams\b/iu,
      /\bserious builders\b/iu,
      /\bpeople in the industry\b/iu,
    ],
    strongPatterns: [/\bevery serious team\b/iu],
  },
  'ai-hook-014': {
    weakPatterns: [
      /\bour team stopped writing code\b/iu,
      /\binside .* nobody writes code\b/iu,
      /\binternal example\b/iu,
    ],
    strongPatterns: [/\bour team stopped writing code\b/iu],
  },
  'ai-hook-016': {
    weakPatterns: [/\bcost:.*->/iu, /\bspeed:.*->/iu, /\bprivacy:.*->/iu],
    strongPatterns: [/\bcost:.*speed:.*privacy:/iu],
  },
  'ai-hook-021': {
    weakPatterns: [/\bthis is all you need\b/iu, /\bone tool and done\b/iu],
    strongPatterns: [/\bthis is all you need\b/iu],
  },
  'ai-hook-022': {
    weakPatterns: [
      /\bbest ai tool\b/iu,
      /\bthe only tool you need\b/iu,
      /\bendgame\b/iu,
      /\bking\b/iu,
    ],
    strongPatterns: [/\bthe only tool you need\b/iu],
  },
  'ai-hook-023': {
    weakPatterns: [/\bin 10 minutes\b/iu, /\b30 seconds later\b/iu, /\bin a few minutes\b/iu],
    strongPatterns: [/\bin 10 minutes\b/iu, /\b30 seconds later\b/iu],
  },
  'ai-hook-026': {
    weakPatterns: [/\bagency-quality\b/iu, /\bexpert-level output\b/iu, /\boutsourced quality\b/iu],
    strongPatterns: [/\bexpert-level output without hiring\b/iu],
  },
  'ai-hook-028': {
    weakPatterns: [/\bno developer needed\b/iu, /\bwithout developers\b/iu, /\bno code required\b/iu],
    strongPatterns: [/\bno developer needed\b/iu],
  },
  'ai-hook-031': {
    weakPatterns: [/\bcost:.*->/iu, /\bprivacy:.*->/iu, /\bspeed:.*->/iu],
    strongPatterns: [/\bcost:.*->/iu],
  },
  'ai-hook-035': {
    weakPatterns: [/\blocal vs cloud\b/iu, /\bmac vs nvidia\b/iu, /\bcloud api .* local\b/iu],
    strongPatterns: [/\blocal vs cloud\b/iu],
  },
  'ai-hook-036': {
    weakPatterns: [/\belectricity only costs \$\d+/iu, /\$\d+\/month\b/iu, /\boperating cost\b/iu],
    strongPatterns: [/\$\d+\/month .* electricity .* \$\d+/iu],
  },
  'ai-hook-039': {
    weakPatterns: [/\bthis product is the answer\b/iu, /\bthe one correct setup\b/iu],
    strongPatterns: [/\bthis product is the answer\b/iu],
  },
  'ai-hook-041': {
    weakPatterns: [
      /\bmac mini alone\b/iu,
      /\byour mac becomes an ai server\b/iu,
      /\bapple silicon\b/iu,
      /\bm-series\b/iu,
    ],
    strongPatterns: [/\bmac mini alone\b/iu],
  },
  'ai-hook-042': {
    weakPatterns: [/\bcursor\b/iu, /\bperplexity\b/iu, /\bollama\b/iu, /\bclaude\b/iu],
    strongPatterns: [/\bcursor\b.*\bcursor\b/iu],
  },
  'ai-hook-043': {
    weakPatterns: [/\bthis one tool does it all\b/iu, /\bone tool and done\b/iu],
    strongPatterns: [/\bthis one tool does it all\b/iu],
  },
  'ai-hook-044': {
    weakPatterns: [/\binstall it now\b/iu, /\bbuy it now\b/iu, /\bstart now\b/iu],
    strongPatterns: [/\binstall it now\b/iu],
  },
  'ai-hook-049': {
    weakPatterns: [/\bclick the link\b/iu, /\btry it now\b/iu, /\bget it today\b/iu],
    strongPatterns: [/\btry it now\b/iu],
  },
  'ai-hook-052': {
    weakPatterns: [/\bput simply\b/iu, /\bin short\b/iu, /\bto sum it up\b/iu],
    strongPatterns: [/\bput simply\b.*\bthe key point is\b/iu],
  },
  'ai-hook-053': {
    weakPatterns: [/\bclean summary\b/iu, /\bhere are 3 takeaways\b/iu, /\bthe key point is\b/iu],
    strongPatterns: [/\bhere are 3 takeaways\b/iu],
  },
  'ai-hook-059': {
    weakPatterns: [/\bhere is the thing\b/iu, /\ball of this points to one thing\b/iu],
    strongPatterns: [/\ball of this points to one thing\b/iu],
  },
  'ai-hook-061': {
    weakPatterns: [/\bthese days everyone does this\b/iu, /\bnow everyone uses this\b/iu],
    strongPatterns: [/\bthese days everyone does this\b/iu],
  },
  'ai-hook-062': {
    weakPatterns: [/\bif you do not know this, you are behind\b/iu, /\byou are falling behind\b/iu],
    strongPatterns: [/\bif you do not know this, you are behind\b/iu],
  },
  'ai-hook-071': {
    weakPatterns: [/\bsetup is trivial\b/iu, /\bjust install and go\b/iu, /\binstall takes minutes\b/iu],
    strongPatterns: [/\bjust install and go\b/iu],
  },
  'ai-hook-075': {
    weakPatterns: [/\bmaintenance is basically free\b/iu, /\bno ops cost\b/iu, /\bonly electricity\b/iu],
    strongPatterns: [/\bonly electricity\b/iu],
  },
  'ai-hook-076': {
    weakPatterns: [/\bskip security\b/iu, /\bskip testing\b/iu, /\bskip deployment\b/iu],
    strongPatterns: [/\bproduction without testing\b/iu],
  },
  'ai-hook-077': {
    weakPatterns: [/\bprototype = production\b/iu, /\bship the prototype as the real product\b/iu],
    strongPatterns: [/\bprototype = production\b/iu],
  },
  'ai-hook-079': {
    weakPatterns: [/\bjust paste the prompt\b/iu, /\bprompt and done\b/iu],
    strongPatterns: [/\bprompt and done\b/iu],
  },
  'ai-hook-081': {
    weakPatterns: [/\bcompletely free\b/iu, /\bzero dollars\b/iu, /\bfree forever\b/iu],
    strongPatterns: [/\bcompletely free\b/iu],
  },
  'ai-hook-083': {
    weakPatterns: [/\b30 seconds later\b/iu, /\b10 minutes a day\b/iu],
    strongPatterns: [/\b30 seconds later\b/iu],
  },
  'ai-hook-084': {
    weakPatterns: [/\bsaves you \$\d+ in agency cost\b/iu, /\bavoids paying contractors \$\d+/iu],
    strongPatterns: [/\bsaves you \$\d+ in agency cost\b/iu],
  },
  'ai-hook-085': {
    weakPatterns: [/\b\d+x productivity\b/iu, /\b\d+% better\b/iu, /\bmassive efficiency gain\b/iu],
    strongPatterns: [/\b\d+x productivity\b/iu],
  },
  'ai-hook-086': {
    weakPatterns: [/\bguaranteed revenue\b/iu, /\bguaranteed monthly savings\b/iu],
    strongPatterns: [/\bguaranteed revenue\b/iu],
  },
  'ai-hook-088': {
    weakPatterns: [/\bno downside\b/iu, /\bno failure cost\b/iu, /\bnothing to lose\b/iu],
    strongPatterns: [/\bnothing to lose\b/iu],
  },
  'ai-hook-089': {
    weakPatterns: [/\bonly operating cost matters\b/iu, /\binfrastructure is basically free\b/iu],
    strongPatterns: [/\bonly operating cost matters\b/iu],
  },
  'ai-hook-100': {
    weakPatterns: [/\byou should buy this\b/iu, /\byou should copy this setup\b/iu, /\binstall it right now\b/iu],
    strongPatterns: [/\binstall it right now\b/iu],
  },
}
