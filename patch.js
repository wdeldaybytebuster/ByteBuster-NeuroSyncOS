const fs = require('fs');
const content = fs.readFileSync('src/ui/components/ScopeLogicChat.tsx', 'utf-8');

const newFetch = `
      // Route directly to the specific endpoint to natively process live streaming
      const res = await fetch('http://localhost:3001/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer freellmapi-cfada39761d420964a7bde605a09e71079beacc2a0fab1b8'
        },
        body: JSON.stringify({
          model: 'Auto',
          messages: [
            { role: 'system', content: 'You are ScopeLogic. Output DAG proposals inside ```json.' },
            ...chatLog.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMsg }
          ],
          stream: true
        })
      });

      if (!res.ok) {
        throw new Error(\`Network error: \${res.status} \${res.statusText}\`);
      }

      setChatLog(prev => [...prev, { role: 'system', content: '' }]);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.substring(6));
                const delta = parsed.choices[0]?.delta?.content || '';
                fullResponse += delta;
                setChatLog(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1].content = fullResponse;
                  return copy;
                });
              } catch (e) {}
            }
          }
        }
      }

      // If it looks like a DAG proposal, emit it
      if (fullResponse.includes('```json') || fullResponse.includes('dagProposal')) {
        try {
          const fenceMatch = fullResponse.match(/\`\`\`(?:json)?\\s*([\\s\\S]*?)\`\`\`/);
          const jsonStr = fenceMatch ? fenceMatch[1] : fullResponse;
          const parsed = JSON.parse(jsonStr);
          if (parsed.nodes || parsed.dagProposal) {
             const proposal = parsed.dagProposal || parsed;
             setComplete(true);
             onProposal?.(proposal);
          }
        } catch(e) {}
      }
`;

// Replace the try block inside handleSend
const tryMatch = content.match(/try \{\s*const res = await fetch\('http:\/\/localhost:3743\/api\/scopelogic\/prompt'.*?\} catch \(err: any\) \{/s);
if (tryMatch) {
  let modified = content.replace(tryMatch[0], `try {${newFetch}\n    } catch (err: any) {`);
  fs.writeFileSync('src/ui/components/ScopeLogicChat.tsx', modified);
  console.log("Patched ScopeLogicChat.tsx successfully");
} else {
  console.log("Could not match fetch inside ScopeLogicChat.tsx");
}
