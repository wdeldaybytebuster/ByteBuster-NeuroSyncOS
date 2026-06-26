// GBNF Grammar for strictly constraining llama.cpp output for ScopeLogic
// This enforces the model to output precisely valid JSON that conforms to the DAG Proposal schema.

export const ScopeLogicGBNF = `
root ::= "{" ws "\\"nodes\\"" ws ":" ws "[" ws node (ws "," ws node)* ws "]" ws "}"
node ::= "{" ws "\\"id\\"" ws ":" ws string ws "," ws "\\"dependencies\\"" ws ":" ws "[" ws stringlist "]" ws "," ws "\\"prompt\\"" ws ":" ws string ws "}"
stringlist ::= (string (ws "," ws string)*)?
string ::= "\\"" [^"]* "\\""
ws ::= [ \\t\\n\\r]*
`;
