# 🤝 Contributing to VisionAssist

First off, thank you for considering contributing to VisionAssist! It's people like you that make this open source project great for the visually impaired community.

## 🎯 Code of Conduct

By participating in this project, you are expected to uphold our **[Code of Conduct](CODE_OF_CONDUCT.md)**.

---

## 🚀 How Can I Contribute?

### Reporting Bugs
Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

1. **Describe the exact steps** to reproduce the problem
2. **Provide specific examples** to demonstrate the steps
3. **Describe the behavior you observed** after following the steps
4. **Describe the behavior you expected** to see instead
5. **Include screenshots, videos, or GIFs** if possible

### Suggesting Enhancements
We love new ideas! Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

1. **Use a clear and descriptive title**
2. **Provide a step-by-step description** of the suggested enhancement
3. **Provide specific examples** to demonstrate the steps
4. **Describe the current behavior** and **explain which behavior you expected to see instead**
5. **Explain why this enhancement would be useful** to most VisionAssist users

### Your First Code Contribution

#### Beginner-Friendly Issues
Look for issues labeled `good first issue` - these are specifically chosen for new contributors.

#### Setting Up Development Environment
1. Fork the repository
2. Clone your fork locally
3. Set up the development environment (see **[Development Guide](docs/development.md)**)
4. Create a branch for your changes

---

## 🛠️ Development Workflow

### Pull Requests

1. **Follow the coding standards** outlined in our **[Development Guide](docs/development.md)**
2. **Include appropriate tests** if you're adding new functionality
3. **Update documentation** for any changed or new features
4. **End files with a newline**
5. **Use descriptive commit messages**

### Branch Organization
* `main` - stable, production-ready code
* `develop` - integration branch for features
* `feature/*` - new features
* `bugfix/*` - bug fixes
* `hotfix/*` - urgent production fixes

### Making Changes
1. Create a topic branch from `main` branch
2. Make your changes in that branch
3. Ensure your code follows the project standards
4. Test your changes thoroughly
5. Submit a pull request to the `main` branch

---

## 📋 Areas Needing Contribution

### High Priority
* 📱 **Mobile Development**: PWA or native app development
* 🎨 **UI/UX Improvements**: Better accessibility and user experience
* 🔧 **Performance Optimization**: Faster detection and lower resource usage

### Medium Priority
* 📚 **Documentation**: Improved guides and tutorials
* 🌐 **Multi-language Support**: Internationalization
* 🧪 **Testing**: Unit tests and integration tests

### Low Priority
* 🎯 **Additional Features**: New detection capabilities
* 🔌 **Integrations**: Third-party service integrations

---

## 💻 Development Setup

### Prerequisites
* Python 3.8+
* Modern web browser
* Git

### Quick Start
```bash
# Clone and setup
git clone https://github.com/your-username/vision-assist.git
cd vision-assist
pip install -r requirements.txt

# Run development server
cd src/backend
python local_yolo_server.py

# Test frontend
# Open src/frontend/index.html in browser