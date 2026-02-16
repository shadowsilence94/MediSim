# MediSim Project Documentation

## Overview

MediSim is a group project for an NLP (Natural Language Processing) class that incorporates Python's famous `antigravity` Easter egg module.

## Getting Started

### Prerequisites

- Python 3.7 or higher
- pip package manager

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/shadowsilence94/MediSim.git
   cd MediSim
   ```

2. Install the package:
   ```bash
   pip install -e .
   ```

## Usage Guide

### Running MediSim

#### From Command Line

After installation, you can run MediSim directly from the command line:

```bash
medisim
```

This will:
1. Print a welcome message
2. Launch the antigravity module
3. Open your web browser to the XKCD antigravity comic

#### From Python

You can also use MediSim as a Python module:

```python
import medisim

# Launch with antigravity
medisim.launch()

# Or call main directly
medisim.main()
```

#### Running the Demo

A demo script is provided in the examples directory:

```bash
python examples/demo.py
```

## Testing

Run the test suite using Python's unittest:

```bash
python -m unittest discover tests
```

Or run tests with pytest if installed:

```bash
pytest tests/
```

## Project Architecture

### Package Structure

- `medisim/__init__.py`: Main package file containing the launch and main functions
- `examples/demo.py`: Demonstration script
- `tests/test_medisim.py`: Unit tests
- `setup.py`: Package configuration
- `requirements.txt`: Dependencies

### Key Components

#### `medisim.launch()`

The main launch function that:
- Displays project information
- Calls `antigravity.fly()` to open the XKCD comic

#### `medisim.main()`

Entry point for the command-line interface that calls `launch()`.

## About Antigravity

The `antigravity` module is a Python Easter egg included in the standard library. It was added as a humorous reference to XKCD comic #353, which jokes that Python is so powerful it lets you fly.

When you `import antigravity`, Python opens a web browser and navigates to: https://xkcd.com/353/

The comic shows a stick figure flying with the caption explaining that Python lets you do this with simple code.

## Future Development

This project serves as a foundation for NLP work. Potential extensions include:

- Text processing utilities
- Named Entity Recognition (NER)
- Sentiment analysis tools
- Document classification
- Text generation models

## Contributing

This is a group project for an NLP class. Team members should:

1. Create a feature branch
2. Make changes
3. Write tests
4. Submit a pull request

## License

This project is for educational purposes.
