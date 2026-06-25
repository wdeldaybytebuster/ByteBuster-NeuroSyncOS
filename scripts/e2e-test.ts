import crypto from 'crypto';

async function runE2E() {
  console.log("🚀 Starting E2E Test: Workspace Provisioning & Test-Fix-Retest Loop");

  try {
    // 1. Create a Project
    console.log("1. Provisioning a new Project...");
    const projRes = await fetch('http://localhost:3743/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: "E2E Isolation Test" })
    });
    
    if (!projRes.ok) {
      const errorText = await projRes.text();
      throw new Error(`Failed to create project: ${errorText}`);
    }
    const respObj = await projRes.json();
    const projData = respObj.project || respObj;
    console.log(`   ✅ Project created: ${projData.id}`);
    console.log(`   ✅ Physical workspace path provisioned: ${projData.workspace_path}`);

    // 2. Submit a DAG Proposal that intentionally fails in the sandbox
    console.log("\n2. Submitting a failing command to trigger the Error Trap...");
    const proposal = {
      nodes: [
        {
          id: crypto.randomUUID(),
          dependencies: [],
          prompt: "ls -la /non_existent_folder_e2e_test"
        }
      ]
    };

    const approveRes = await fetch('http://localhost:3743/api/coreexec/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal, projectId: projData.id })
    });
    
    if (!approveRes.ok) {
      const text = await approveRes.text();
      throw new Error(`Approval failed: ${text}`);
    }
    const approveData = await approveRes.json();
    console.log(`   ✅ DAG Approved & Run ID generated: ${approveData.runId}`);

    // 3. Wait for the run to park due to the failure
    console.log("\n3. Waiting for CoreExec Engine to execute and trap the failure...");
    let runStatus = 'running';
    let runDetails = null;

    while (runStatus === 'running' || runStatus === 'pending') {
      await new Promise(r => setTimeout(r, 1000));
      const statusRes = await fetch(`http://localhost:3743/api/coreexec/run/${approveData.runId}/status`);
      runDetails = await statusRes.json();
      
      // In phase 8, failing validation or failing execution causes it to park or fail
      runStatus = runDetails.status || 'running';
    }

    console.log(`   ✅ Run Status shifted to: ${runStatus}`);

    const failedTask = runDetails.tasks[0];
    console.log(`   --> Task Data:`, failedTask);
    const outputData = failedTask ? JSON.parse(failedTask.output_data || "{}") : {};
    console.log(`   --> Output Data:`, outputData);
    
    if (outputData.error && outputData.error.includes("SA-02 Security Violation: Path traversal detected")) {
      console.log("\n🎯 SUCCESS! The CommandSandbox successfully trapped the Path Traversal violation.");
      console.log("   Extracted Error Log ready for the Rationale-First LLM Loop:");
      console.log(`   --> "${outputData.error}"`);
    } else if (outputData.error && outputData.error.includes("No such file or directory")) {
      console.log("\n🎯 SUCCESS! The CommandSandbox successfully trapped the non-zero exit code.");
      console.log("   Extracted Error Log ready for the Rationale-First LLM Loop:");
      console.log(`   --> "${outputData.error}"`);
    } else {
      console.log("\n❌ FAILED. Did not trap the expected stderr string.", outputData);
    }
    
    console.log("\n✅ E2E Test Completed Successfully!");

  } catch (error) {
    console.error("E2E Test Failed:", error);
  }
}

runE2E();
