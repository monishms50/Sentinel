import React, { useState } from 'react';

const ExecutionFlowDiagram = () => {
  const [activeStep, setActiveStep] = useState(null);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const steps = [
    {
      id: 1,
      title: 'Prerequisites Check',
      icon: '🔍',
      command: 'docker --version && kubectl version && minikube version',
      description: 'Verify Docker, kubectl, and minikube are installed',
      status: 'required',
      time: '1 min'
    },
    {
      id: 2,
      title: 'Cluster Setup',
      icon: '☸️',
      command: './scripts/setup-minikube.sh',
      description: 'Create minikube cluster with sentinel & demo-app namespaces',
      status: 'required',
      time: '3-5 min'
    },
    {
      id: 3,
      title: 'Docker Environment',
      icon: '🐳',
      command: 'eval $(minikube docker-env)',
      description: 'Configure shell to use minikube Docker daemon',
      status: 'required',
      time: '< 1 min'
    },
    {
      id: 4,
      title: 'Build Images',
      icon: '🔨',
      command: 'make docker',
      description: 'Build sentinel-api, sentinel-agent, sentinel-controller images',
      status: 'required',
      time: '5-10 min'
    },
    {
      id: 5,
      title: 'Deploy Stack',
      icon: '🚀',
      command: './scripts/deploy-all.sh',
      description: 'Deploy all components to Kubernetes',
      status: 'required',
      time: '2-3 min'
    },
    {
      id: 6,
      title: 'Port Forward',
      icon: '🔗',
      command: 'kubectl port-forward -n sentinel svc/sentinel-api 8080:8080',
      description: 'Make API accessible at localhost:8080',
      status: 'required',
      time: '< 1 min'
    },
    {
      id: 7,
      title: 'Verify Health',
      icon: '💚',
      command: 'curl http://localhost:8080/health',
      description: 'Check API is responding correctly',
      status: 'verification',
      time: '< 1 min'
    },
    {
      id: 8,
      title: 'Simulate Attack',
      icon: '⚔️',
      command: './scripts/simulate-attack.sh --type=all',
      description: 'Create drift events to test detection',
      status: 'testing',
      time: '1-2 min'
    },
    {
      id: 9,
      title: 'Verify Drift',
      icon: '📊',
      command: 'curl http://localhost:8080/api/leaderboard | jq',
      description: 'Check that scores dropped after attack',
      status: 'verification',
      time: '< 1 min'
    },
    {
      id: 10,
      title: 'E2E Tests',
      icon: '🧪',
      command: './scripts/run-e2e-tests.sh',
      description: 'Run full end-to-end test suite',
      status: 'testing',
      time: '2-3 min'
    }
  ];

  const toggleStep = (id) => {
    setActiveStep(activeStep === id ? null : id);
  };

  const markComplete = (id, e) => {
    e.stopPropagation();
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(id)) {
      newCompleted.delete(id);
    } else {
      newCompleted.add(id);
    }
    setCompletedSteps(newCompleted);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'required': return 'bg-blue-500';
      case 'verification': return 'bg-green-500';
      case 'testing': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const progress = (completedSteps.size / steps.length) * 100;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <h1 className="text-4xl font-bold text-center mb-2">
          <span className="text-green-400">SENTINEL</span> Execution Flow
        </h1>
        <p className="text-gray-400 text-center">
          Kubernetes Pod Entropy Monitor - Integration Guide
        </p>
        
        {/* Progress Bar */}
        <div className="mt-6 bg-gray-800 rounded-full h-4 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-green-500 to-green-400 h-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-sm text-gray-500 mt-2">
          {completedSteps.size} of {steps.length} steps completed ({Math.round(progress)}%)
        </p>
      </div>

      {/* Flow Diagram */}
      <div className="max-w-4xl mx-auto">
        <div className="relative">
          {/* Vertical Line */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-700" />
          
          {/* Steps */}
          {steps.map((step, index) => (
            <div key={step.id} className="relative mb-4">
              {/* Step Node */}
              <div 
                className={`
                  flex items-start cursor-pointer
                  ${activeStep === step.id ? 'opacity-100' : 'opacity-80 hover:opacity-100'}
                  transition-all duration-200
                `}
                onClick={() => toggleStep(step.id)}
              >
                {/* Circle */}
                <div 
                  className={`
                    w-16 h-16 rounded-full flex items-center justify-center text-2xl
                    ${completedSteps.has(step.id) 
                      ? 'bg-green-500 ring-4 ring-green-500/30' 
                      : 'bg-gray-800 ring-2 ring-gray-700'}
                    z-10 transition-all duration-300
                  `}
                >
                  {completedSteps.has(step.id) ? '✓' : step.icon}
                </div>
                
                {/* Content Card */}
                <div 
                  className={`
                    ml-4 flex-1 bg-gray-800 rounded-lg p-4 border-l-4
                    ${completedSteps.has(step.id) 
                      ? 'border-green-500' 
                      : getStatusColor(step.status).replace('bg-', 'border-')}
                    ${activeStep === step.id ? 'ring-2 ring-blue-500/50' : ''}
                    transition-all duration-200
                  `}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <span className="text-gray-500">Step {step.id}:</span>
                        {step.title}
                        <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(step.status)}`}>
                          {step.status}
                        </span>
                      </h3>
                      <p className="text-gray-400 text-sm mt-1">{step.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">⏱ {step.time}</span>
                      <button
                        onClick={(e) => markComplete(step.id, e)}
                        className={`
                          px-3 py-1 rounded text-sm font-medium transition-colors
                          ${completedSteps.has(step.id)
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-gray-700 hover:bg-gray-600'}
                        `}
                      >
                        {completedSteps.has(step.id) ? 'Done ✓' : 'Mark Done'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {activeStep === step.id && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <p className="text-sm text-gray-500 mb-2">Command:</p>
                      <div className="bg-gray-900 rounded p-3 font-mono text-sm text-green-400 overflow-x-auto">
                        $ {step.command}
                      </div>
                      <button
                        className="mt-3 text-sm text-blue-400 hover:text-blue-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(step.command);
                        }}
                      >
                        📋 Copy command
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Arrow */}
              {index < steps.length - 1 && (
                <div className="absolute left-8 top-16 transform -translate-x-1/2">
                  <div className="text-gray-600 text-xl">↓</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="max-w-4xl mx-auto mt-8 p-6 bg-gray-800 rounded-lg">
        <h2 className="text-xl font-bold mb-4">🚀 Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 p-4 rounded-lg">
            <h3 className="font-bold text-green-400 mb-2">Full Auto Setup</h3>
            <code className="text-sm text-gray-400 block bg-black p-2 rounded">
              ./scripts/quick-start.sh
            </code>
          </div>
          <div className="bg-gray-900 p-4 rounded-lg">
            <h3 className="font-bold text-yellow-400 mb-2">Docker Compose</h3>
            <code className="text-sm text-gray-400 block bg-black p-2 rounded">
              docker compose up -d
            </code>
          </div>
          <div className="bg-gray-900 p-4 rounded-lg">
            <h3 className="font-bold text-red-400 mb-2">Attack Simulation</h3>
            <code className="text-sm text-gray-400 block bg-black p-2 rounded">
              ./scripts/simulate-attack.sh --type=all
            </code>
          </div>
          <div className="bg-gray-900 p-4 rounded-lg">
            <h3 className="font-bold text-blue-400 mb-2">Cleanup</h3>
            <code className="text-sm text-gray-400 block bg-black p-2 rounded">
              ./scripts/quick-start.sh --cleanup
            </code>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="max-w-4xl mx-auto mt-6 flex justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500" />
          <span className="text-gray-400">Required</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500" />
          <span className="text-gray-400">Verification</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-purple-500" />
          <span className="text-gray-400">Testing</span>
        </div>
      </div>
    </div>
  );
};

export default ExecutionFlowDiagram;
