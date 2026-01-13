import React, { useState } from 'react';
import ExecutionFlowDiagram from "./executionflowdiagram";

const SentinelExecutionFlow = () => {
  const [activePhase, setActivePhase] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [copiedCommand, setCopiedCommand] = useState(null);

  const phases = [
    {
      name: "Prerequisites",
      icon: "🔍",
      color: "from-blue-600 to-blue-400",
      steps: [
        { id: 1, name: "Check Docker", cmd: "docker --version && docker info", desc: "Verify Docker is installed and running" },
        { id: 2, name: "Check kubectl", cmd: "kubectl version --client", desc: "Verify Kubernetes CLI is installed" },
        { id: 3, name: "Check minikube", cmd: "minikube version", desc: "Verify minikube is installed" },
        { id: 4, name: "Check Resources", cmd: "free -h && nproc && df -h", desc: "Verify 8GB+ RAM, 4+ CPUs, 20GB+ disk" },
      ]
    },
    {
      name: "Cluster Setup",
      icon: "☸️",
      color: "from-purple-600 to-purple-400",
      steps: [
        { id: 5, name: "Create Cluster", cmd: "./scripts/setup-minikube.sh", desc: "Creates minikube with sentinel & demo-app namespaces" },
        { id: 6, name: "Configure Docker", cmd: "eval $(minikube docker-env)", desc: "Route Docker to minikube's daemon (run in each terminal)" },
        { id: 7, name: "Verify Cluster", cmd: "kubectl get namespaces", desc: "Should show sentinel and demo-app namespaces" },
      ]
    },
    {
      name: "Build & Deploy",
      icon: "🚀",
      color: "from-green-600 to-green-400",
      steps: [
        { id: 8, name: "Build Images", cmd: "make docker", desc: "Build sentinel-api, sentinel-agent, sentinel-controller" },
        { id: 9, name: "Deploy Stack", cmd: "./scripts/deploy-all.sh", desc: "Deploy all components to Kubernetes" },
        { id: 10, name: "Check Pods", cmd: "kubectl get pods -n sentinel && kubectl get pods -n demo-app", desc: "All pods should be Running" },
      ]
    },
    {
      name: "Access & Verify",
      icon: "🔗",
      color: "from-yellow-600 to-yellow-400",
      steps: [
        { id: 11, name: "Port Forward", cmd: "kubectl port-forward -n sentinel svc/sentinel-api 8080:8080 &", desc: "Make API accessible at localhost:8080" },
        { id: 12, name: "Health Check", cmd: "curl http://localhost:8080/health | jq", desc: "Should return {\"status\": \"healthy\"}" },
        { id: 13, name: "List Pods", cmd: "curl http://localhost:8080/api/pods | jq", desc: "Should return monitored pods" },
        { id: 14, name: "Leaderboard", cmd: "curl http://localhost:8080/api/leaderboard | jq", desc: "Should show pods sorted by score" },
      ]
    },
    {
      name: "Attack Simulation",
      icon: "⚔️",
      color: "from-red-600 to-red-400",
      steps: [
        { id: 15, name: "Run Attack", cmd: "./scripts/simulate-attack.sh --type=all --severity=critical", desc: "Creates files, processes, opens ports in demo pods" },
        { id: 16, name: "Wait for Detection", cmd: "sleep 15", desc: "Allow agent to detect drift" },
        { id: 17, name: "Check Scores", cmd: "curl http://localhost:8080/api/leaderboard | jq '.data[:5]'", desc: "Scores should have dropped from 100" },
        { id: 18, name: "View Events", cmd: "curl http://localhost:8080/api/events | jq '.data[:5]'", desc: "Should show drift events" },
      ]
    },
    {
      name: "E2E Testing",
      icon: "🧪",
      color: "from-cyan-600 to-cyan-400",
      steps: [
        { id: 19, name: "Run Tests", cmd: "./scripts/run-e2e-tests.sh", desc: "Execute full end-to-end test suite" },
        { id: 20, name: "Verify Results", cmd: "./scripts/verify.sh", desc: "Quick verification of all components" },
      ]
    },
    {
      name: "Cleanup",
      icon: "🧹",
      color: "from-gray-600 to-gray-400",
      steps: [
        { id: 21, name: "Cleanup Attack", cmd: "./scripts/simulate-attack.sh --cleanup", desc: "Remove attack artifacts" },
        { id: 22, name: "Delete Stack", cmd: "./scripts/deploy-all.sh --delete", desc: "Remove Kubernetes deployments" },
        { id: 23, name: "Stop Minikube", cmd: "minikube stop", desc: "Stop the cluster" },
        { id: 24, name: "Delete Cluster", cmd: "minikube delete", desc: "Completely remove cluster" },
      ]
    }
  ];

  const copyCommand = (cmd, id) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCommand(id);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const toggleComplete = (id) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(id)) {
      newCompleted.delete(id);
    } else {
      newCompleted.add(id);
    }
    setCompletedSteps(newCompleted);
  };

  const totalSteps = phases.reduce((acc, p) => acc + p.steps.length, 0);
  const progress = (completedSteps.size / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold">
          <span className="bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            SENTINEL
          </span>
          {" "}Execution Flow
        </h1>
        <p className="text-gray-400 text-sm mt-1">Kubernetes Pod Entropy Monitor - Integration Guide</p>
        
        {/* Progress */}
        <div className="max-w-md mx-auto mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{completedSteps.size}/{totalSteps} ({Math.round(progress)}%)</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-500 to-green-300 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Phase Tabs */}
      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {phases.map((phase, idx) => (
          <button
            key={idx}
            onClick={() => setActivePhase(idx)}
            className={`
              px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${activePhase === idx 
                ? `bg-gradient-to-r ${phase.color} shadow-lg scale-105` 
                : 'bg-gray-800 hover:bg-gray-700'}
            `}
          >
            {phase.icon} {phase.name}
          </button>
        ))}
      </div>

      {/* Active Phase Content */}
      <div className="max-w-4xl mx-auto">
        <div className={`bg-gradient-to-r ${phases[activePhase].color} p-1 rounded-xl`}>
          <div className="bg-gray-900 rounded-xl p-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-2xl">{phases[activePhase].icon}</span>
              Phase {activePhase + 1}: {phases[activePhase].name}
            </h2>

            <div className="space-y-3">
              {phases[activePhase].steps.map((step, idx) => (
                <div 
                  key={step.id}
                  className={`
                    bg-gray-800 rounded-lg p-4 border-l-4 transition-all
                    ${completedSteps.has(step.id) 
                      ? 'border-green-500 bg-green-900/20' 
                      : 'border-gray-600'}
                  `}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-500 text-sm">Step {step.id}</span>
                        <h3 className="font-semibold">{step.name}</h3>
                        {completedSteps.has(step.id) && (
                          <span className="text-green-400">✓</span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm mb-2">{step.desc}</p>
                      
                      {/* Command */}
                      <div className="bg-black rounded p-2 font-mono text-sm flex items-center justify-between">
                        <code className="text-green-400 overflow-x-auto">$ {step.cmd}</code>
                        <button
                          onClick={() => copyCommand(step.cmd, step.id)}
                          className="ml-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs whitespace-nowrap"
                        >
                          {copiedCommand === step.id ? '✓ Copied!' : '📋 Copy'}
                        </button>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => toggleComplete(step.id)}
                      className={`
                        px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                        ${completedSteps.has(step.id)
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gray-700 hover:bg-gray-600'}
                      `}
                    >
                      {completedSteps.has(step.id) ? '✓ Done' : 'Mark Done'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Reference */}
      <div className="max-w-4xl mx-auto mt-6 bg-gray-800 rounded-xl p-4">
        <h3 className="font-bold mb-3 text-lg">⚡ Quick Commands</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-gray-900 p-3 rounded-lg">
            <div className="text-green-400 font-semibold text-sm mb-1">🚀 Full Auto Setup</div>
            <code className="text-xs text-gray-400">./scripts/quick-start.sh</code>
          </div>
          <div className="bg-gray-900 p-3 rounded-lg">
            <div className="text-blue-400 font-semibold text-sm mb-1">🐳 Docker Compose (No K8s)</div>
            <code className="text-xs text-gray-400">docker compose up -d</code>
          </div>
          <div className="bg-gray-900 p-3 rounded-lg">
            <div className="text-red-400 font-semibold text-sm mb-1">⚔️ Attack Simulation</div>
            <code className="text-xs text-gray-400">./scripts/simulate-attack.sh --type=all</code>
          </div>
          <div className="bg-gray-900 p-3 rounded-lg">
            <div className="text-yellow-400 font-semibold text-sm mb-1">✅ Verify Everything</div>
            <code className="text-xs text-gray-400">./scripts/verify.sh</code>
          </div>
        </div>
      </div>

      {/* Flow Diagram */}
      <div className="max-w-6xl mx-auto mt-6">
        <ExecutionFlowDiagram />
      </div>


      {/* Expected Results */}
      <div className="max-w-4xl mx-auto mt-6 bg-gray-800 rounded-xl p-4">
        <h3 className="font-bold mb-3 text-lg">🎯 Success Criteria</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-gray-300">
            <span className="text-green-400">✓</span> All pods in Running state
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <span className="text-green-400">✓</span> /health returns "healthy"
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <span className="text-green-400">✓</span> Pods show initial score of 100
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <span className="text-green-400">✓</span> Attack drops scores below 50
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <span className="text-green-400">✓</span> Drift events recorded in API
          </div>
          <div className="flex items-center gap-2 text-gray-300">
            <span className="text-green-400">✓</span> E2E tests pass (80%+)
          </div>
        </div>
      </div>
    </div>
  );
};

export default SentinelExecutionFlow;
