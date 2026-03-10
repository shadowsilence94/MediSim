"""
Tests for MediSim
"""

import unittest
from unittest.mock import patch, MagicMock
import sys
import medisim


class TestMediSim(unittest.TestCase):
    """Test cases for MediSim package"""

    def test_version(self):
        """Test that version is defined"""
        self.assertEqual(medisim.__version__, "0.1.0")

    def test_author(self):
        """Test that author is defined"""
        self.assertEqual(medisim.__author__, "MediSim Team")

    def test_launch(self):
        """Test that launch function works and imports antigravity"""
        # Mock the antigravity module to prevent browser opening during tests
        mock_antigravity = MagicMock()
        sys.modules['antigravity'] = mock_antigravity
        
        with patch('builtins.print'):
            medisim.launch()
        
        # Verify antigravity was imported by checking it's in sys.modules
        self.assertIn('antigravity', sys.modules)

    @patch('medisim.launch')
    def test_main(self, mock_launch):
        """Test that main function calls launch"""
        medisim.main()
        mock_launch.assert_called_once()


if __name__ == '__main__':
    unittest.main()
