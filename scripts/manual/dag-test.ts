import crypto from 'crypto';

async function testDAG() {
  console.log("🚀 Starting E2E Test: DAG Engine Topological Dependency Resolution");

  try {
    const nodeAId = crypto.randomUUID();
    const nodeBId = crypto.randomUUID();
    const nodeCId = crypto.randomUUID();

    const proposal = {
      nodes: [
        {
          id: nodeCId, // Out of order intentionally
          dependencies: [nodeAId, nodeBId],
          prompt: "python3 -c print('Hello_C')"
        },
        {
          id: nodeAId,
          dependencies: [],
          prompt: "python3 -c print('Hello_A')"
        },
        {
          id: nodeBId,
          dependencies: [nodeAId],
          prompt: "python3 -c print('Hello_B')"
        }
      ]
    };

    console.log("0. Creating a Project to bind workspace...");
    const projRes = await fetch('http://localhost:3743/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: "DAG Test Project" })
    });
    const projData = await projRes.json();
    const projectId = projData.project.id;

    console.log("1. Submitting multi-node DAG to /api/coreexec/approve...");
    const approveRes = await fetch('http://localhost:3743/api/coreexec/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal, projectId })
    });
    
    if (!approveRes.ok) {
      const err = await approveRes.text();
      throw new Error(`DAG Approval failed: ${err}`);
    }

    const approveData = await approveRes.json();
    console.log(`   ✅ DAG Approved & Run ID generated: ${approveData.runId}`);

    console.log("\n2. Waiting for CoreExec Engine to execute topologically...");
    let runStatus = 'running';
    let runDetails: any = null;

    while (runStatus === 'running' || runStatus === 'pending') {
      await new Promise(r => setTimeout(r, 1000));
      const statusRes = await fetch(`http://localhost:3743/api/coreexec/run/${approveData.runId}/status`);
      runDetails = await statusRes.json();
      runStatus = runDetails.status || 'running';
    }

    console.log(`   ✅ Run Status shifted to: ${runStatus}`);

    // Verify all 3 tasks completed successfully
    const tasks = runDetails.tasks || [];
    
    if (runStatus !== 'completed' || tasks.length !== 3) {
      throw new Error(`❌ FAILURE: Run did not complete successfully or missed tasks. Final status: ${runStatus}, Tasks: ${tasks.length}`);
    }

    let aCompleted = false;
    let bCompleted = false;
    let cCompleted = false;

    for (const t of tasks) {
      if (t.status !== 'completed') {
         throw new Error(`❌ FAILURE: Task ${t.id} failed or parked!`);
      }
      
      const out = JSON.parse(t.output_data);
      if (t.id === nodeAId && out.stdout && out.stdout.includes('Hello_A')) aCompleted = true;
      if (t.id === nodeBId && out.stdout && out.stdout.includes('Hello_B')) bCompleted = true;
      if (t.id === nodeCId && out.stdout && out.stdout.includes('Hello_C')) cCompleted = true;
    }

    if (aCompleted && bCompleted && cCompleted) {
      console.log("\n🎯 SUCCESS! The CoreExec Engine correctly resolved the topological sort and successfully executed the dependency graph.");
    } else {
      console.log(`Debug A: ${aCompleted}, B: ${bCompleted}, C: ${cCompleted}`);
      console.log("Tasks array:", JSON.stringify(tasks, null, 2));
      throw new Error("❌ FAILURE: One or more outputs did not match the expected echo command.");
    }

    console.log("\n✅ E2E DAG Test Completed Successfully!");
  } catch (error) {
    console.error("E2E DAG Test Failed:", error);
  }
}

testDAG();
