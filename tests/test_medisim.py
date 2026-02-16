"""
Tests for MediSim
"""

import unittest
from unittest.mock import patch, MagicMock
import medisim


class TestMediSim(unittest.TestCase):
    """Test cases for MediSim package"""

    def test_version(self):
        """Test that version is defined"""
        self.assertEqual(medisim.__version__, "0.1.0")

    def test_author(self):
        """Test that author is defined"""
        self.assertEqual(medisim.__author__, "MediSim Team")

    @patch('medisim.antigravity')
    def test_launch(self, mock_antigravity):
        """Test that launch function calls antigravity.fly()"""
        mock_antigravity.fly = MagicMock()
        
        with patch('builtins.print'):
            medisim.launch()
        
        mock_antigravity.fly.assert_called_once()

    @patch('medisim.launch')
    def test_main(self, mock_launch):
        """Test that main function calls launch"""
        medisim.main()
        mock_launch.assert_called_once()


if __name__ == '__main__':
    unittest.main()
