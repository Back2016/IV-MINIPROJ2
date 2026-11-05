import unittest
import tempfile
from pathlib import Path
from prepare_data import episode_labels, read_monthly, weighted_temperature, winter_values

class DataChecks(unittest.TestCase):
    def test_episode_boundary(self):
        self.assertEqual(episode_labels([0,.5,.6,.7,.8,0]), ['Neutral']*6)
        self.assertEqual(episode_labels([0,.5,.6,.7,.8,.9,0]), ['Neutral']+['El Niño']*5+['Neutral'])
        self.assertEqual(episode_labels([-.5]*5), ['La Niña']*5)

    def test_missing_sentinels(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / 'tests') as d:
            p=Path(d)/'monthly.txt'
            p.write_text('0040011998 '+ ' '.join(['-9.99']+['1.0']*11))
            self.assertIsNone(read_monthly(p,1)[(4,1998)][0])
            p.write_text('0040021998 '+ ' '.join(['-99.90','-12.0']+['1.0']*10))
            values=read_monthly(p,2)[(4,1998)]
            self.assertIsNone(values[0]); self.assertEqual(values[1],-12)

    def test_december_and_leap_year(self):
        source={(4,1997):[0]*11+[2.96],(4,1998):[6.97,11.5]+[0]*10}
        self.assertAlmostEqual(sum(winter_values(source,4,1998)),21.43)
        self.assertAlmostEqual(weighted_temperature([39.3,23.7,26.7],2016),-1.1275946275946285)

    def test_real_raw_california_reference(self):
        root=Path(__file__).resolve().parents[1]
        p=read_monthly(root/'data-raw'/'climdiv-pcpnst-v1.0.0-20261006',1)
        # Independently sum the indexed source months and 30 complete winters.
        total=p[(4,1997)][11]+p[(4,1998)][0]+p[(4,1998)][1]
        base=sum(p[(4,y-1)][11]+p[(4,y)][0]+p[(4,y)][1] for y in range(1991,2021))/30
        self.assertAlmostEqual(total,21.43); self.assertAlmostEqual(base,11.989)
        self.assertAlmostEqual(100*(total/base-1),78.74718,places=5)

if __name__=='__main__': unittest.main()
