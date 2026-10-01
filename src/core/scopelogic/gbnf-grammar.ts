// GBNF Grammar for strictly constraining llama.cpp output for ScopeLogic
// This enforces the model to output precisely valid JSON that conforms to the DAG Proposal schema.

export const ScopeLogicGBNF = `
root ::= "{" ws "\\"reasoning\\"" ws ":" ws string ws "," ws "\\"nodes\\"" ws ":" ws "[" ws node (ws "," ws node)* ws "]" ws "," ws "\\"confidence\\"" ws ":" ws number ws "}"
node ::= "{" ws "\\"id\\"" ws ":" ws string ws "," ws "\\"dependencies\\"" ws ":" ws "[" ws stringlist "]" ws "," ws "\\"prompt\\"" ws ":" ws string ws "}"
stringlist ::= (string (ws "," ws string)*)?
string ::= "\\"" ([^"\\\\] | "\\\\" .)* "\\""
number ::= "0." [0-9] [0-9]? | "1" (".0" | ".00")?
ws ::= [ \\t\\n\\r]*
`;
