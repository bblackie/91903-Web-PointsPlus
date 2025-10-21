const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const port = 5000;
const app = express();

app.use(express.static('public'));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(expressLayouts);
app.set('view engine', 'ejs');

const DB_FILE = path.join(__dirname, 'PointsPlus.db');
const db = new sqlite3.Database(DB_FILE);

// Express example
app.get('/css/main.css', (req, res) => {
  res.type('text/css');
  res.sendFile(__dirname + '/css/main.css');
});

app.get('/', (req, res) => {
  res.render('home');
});

app.get('/graph', (req, res) => {
  db.get('SELECT name FROM school ORDER BY school_id DESC LIMIT 1', [], (err, row) => {
    if (err) {
      console.error('DB Error:', err);
      return res.render('index', { schoolName: null }); 
    }

    const schoolName = row && row.name ? row.name : null;
    res.render('index', { schoolName });
  });
});

app.get('/form', (req, res) => {
  db.all('SELECT * FROM events ORDER BY event_date, event', [], (err, events) => {
    if (err) return res.status(500).send('DB Error');
    db.all('SELECT * FROM house', [], (err, houses) => {
      if (err) return res.status(500).send('DB Error');
      res.render('form', { events, houses });
    });
  });
});

app.get('/results', (req, res) => {
  const query = `
    SELECT h.house, e.event, e.event_date, a.Placing, a.Points
    FROM Arrangement a
    JOIN house h ON a.house_id = h.house_id
    JOIN events e ON a.event_id = e.event_id
    ORDER BY e.event_date, e.event, h.house, a.Placing
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching results:', err);
      return res.status(500).send('Database Error (results)');
    }

    db.get('SELECT name FROM school ORDER BY school_id DESC LIMIT 1', [], (err2, row2) => {
      if (err2) {
        console.error('Error fetching school name:', err2);
        return res.status(500).send('Database Error (school)');
      }

      const schoolName = row2?.name || null;

      res.render('results', {
        results: rows,
        schoolName: schoolName,
      });
    });
  });
});

app.get('/admin', (req, res) => {
  console.log('Admin route accessed');
  
  db.all('SELECT * FROM events ORDER BY event_date, event', [], (err, events) => {
    if (err) {
      console.error('Error fetching events:', err);
      events = [];
    }
    console.log('Events fetched:', events);
    
    db.all('SELECT * FROM house ORDER BY house', [], (err, houses) => {
      if (err) {
        console.error('Error fetching houses:', err);
        houses = [];
      }
      console.log('Houses fetched:', houses);
      
      const resultsQuery = `
        SELECT h.house, e.event, e.event_date, a.Placing, a.Points
        FROM Arrangement a
        JOIN house h ON a.house_id = h.house_id
        JOIN events e ON a.event_id = e.event_id
        ORDER BY e.event_date, e.event, h.house, a.Placing
      `;
      
      db.all(resultsQuery, [], (err, results) => {
        if (err) {
          console.error('Error fetching results for admin:', err);
          results = [];
        }
        
        console.log('Rendering admin with data:', { 
          events: events || [], 
          houses: houses || [], 
          results: results || [] 
        });
        
        res.render('admin', { 
          events: events || [], 
          houses: houses || [],
          results: results || []
        });
      });
    });
  });
});

app.get('/admin-test', (req, res) => {
  console.log('Admin test route hit!');
  res.send('Admin test route working');
});

app.get('/data/chart-data', (req, res) => {
  const query = `
    SELECT h.house, h.colour, e.event, e.event_date, SUM(a.Points) AS points
    FROM house h
    JOIN Arrangement a ON a.house_id = h.house_id
    JOIN events e ON a.event_id = e.event_id
    GROUP BY h.house, h.colour, e.event, e.event_date
    ORDER BY e.event_date, e.event, h.house;
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching chart data:', err);
      return res.status(500).send('Database Error');
    }
    res.json(rows);
  });
});

app.post('/admin', (req, res) => {
  const {school_name = [], event_name = [], house_name = [], house_color = [] } = req.body;

  school_name.forEach(name => {
    if (name && name.trim() !== "") {
      db.run('INSERT OR IGNORE INTO school (name) VALUES (?)', [name]);
    }
  });

  event_name.forEach(name => {
    if (name) {
      db.run('INSERT OR IGNORE INTO events (event, event_date) VALUES (?, ?)', [name, null]);
    }
  });

  house_name.forEach((name, idx) => {
    if (name && name.trim() !== "") {
      const color = Array.isArray(house_color) ? house_color[idx] : house_color;
      db.run('INSERT OR IGNORE INTO house (house, colour) VALUES (?, ?)', [name, color]);
      db.run('UPDATE house SET colour = ? WHERE house = ? AND (colour IS NULL OR colour = "")', [color, name]);
    }
  });

  res.redirect('/admin');
});

app.post('/admin/delete-event', (req, res) => {
  const { event_id } = req.body;
  
  if (!event_id) {
    return res.status(400).send('Event ID is required');
  }

  db.run('DELETE FROM Arrangement WHERE event_id = ?', [event_id], (err) => {
    if (err) {
      console.error('Error deleting arrangements for event:', err);
      return res.status(500).send('Database Error');
    }
    
    db.run('DELETE FROM events WHERE event_id = ?', [event_id], function(err) {
      if (err) {
        console.error('Error deleting event:', err);
        return res.status(500).send('Database Error');
      }
      
      console.log(`Deleted event with ID ${event_id}`);
      res.redirect('/admin');
    });
  });
});

app.post('/admin/delete-house', (req, res) => {
  const { house_id } = req.body;
  
  if (!house_id) {
    return res.status(400).send('House ID is required');
  }

  db.run('DELETE FROM Arrangement WHERE house_id = ?', [house_id], (err) => {
    if (err) {
      console.error('Error deleting arrangements for house:', err);
      return res.status(500).send('Database Error');
    }
    
    db.run('DELETE FROM house WHERE house_id = ?', [house_id], function(err) {
      if (err) {
        console.error('Error deleting house:', err);
        return res.status(500).send('Database Error');
      }
      
      console.log(`Deleted house with ID ${house_id}`);
      res.redirect('/admin');
    });
  });
});


app.post('/submit', (req, res) => {
  const { event_name, event_date, num_places } = req.body;
  const numPlaces = parseInt(num_places, 10);

  if (!event_name || !numPlaces || isNaN(numPlaces)) {
    return res.status(400).send('All fields are required.');
  }

  const insertEventIfNeeded = (eventName, eventDate, callback) => {  
    db.get('SELECT event_id FROM events WHERE event = ?', [eventName], (err, row) => {
      if (err) {
        console.error('Error finding event:', err);
        return callback(err);
      }
      if (row) {
        if (eventDate && eventDate.trim() !== '') {
          db.run('UPDATE events SET event_date = ? WHERE event_id = ?', 
            [eventDate, row.event_id], function(err) {
              if (err) {
                console.error('Error updating event date:', err);
                return callback(err);
              }
              callback(null, row.event_id);
            });
        } else {
          callback(null, row.event_id);
        }
      } else {
        db.run('INSERT INTO events (event, event_date) VALUES (?, ?)', [eventName, eventDate || null], function(err) {
          if (err) {
            console.error('Error creating new event:', err);
            return callback(err);
          }
          callback(null, this.lastID);
        });
      }
    });
  };

  const getHouseId = (houseName, callback) => {
    db.get('SELECT house_id FROM house WHERE house = ?', [houseName], (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(new Error('House not found'));
      callback(null, row.house_id);
    });
  };

  insertEventIfNeeded(event_name, event_date, (err, eventId) => {
    if (err) {
      console.error('Error in insertEventIfNeeded:', err);
      return res.status(500).send('DB Error');
    }

    function insertPlacing(idx) {
      if (idx > numPlaces) {
        return res.redirect('/graph');
      }
      const house = req.body[`house_${idx}`];
      const points = req.body[`points_${idx}`];
      if (!house || !points) return res.status(400).send('All fields are required.');
      getHouseId(house, (err, houseId) => {
        if (err) return res.status(400).send('House not found. Please add it in Admin.');
        db.run('INSERT INTO Arrangement (Placing, event_id, house_id, Points) VALUES (?, ?, ?, ?)',
          [idx, eventId, houseId, points], (err) => {
            if (err) {
              console.error('Error inserting arrangement:', err);
              return res.status(500).send('DB Error');
            }
            insertPlacing(idx + 1);
          });
      });
    }
    insertPlacing(1);
  });
});

app.post('/admin/clear-db', (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM Arrangement');
    db.run('DELETE FROM events');
    db.run('DELETE FROM school');
    db.run('DELETE FROM house', [], function(err) {
      if (err) {
        console.error('Error clearing database:', err);
        return res.status(500).send('Database Error');
      }
      res.redirect('/admin');
    });
  });
});

app.post('/results/delete', (req, res) => {
  const { house, event, placing } = req.body;
  const query = `
    DELETE FROM Arrangement
    WHERE house_id = (SELECT house_id FROM house WHERE house = ?)
      AND event_id = (SELECT event_id FROM events WHERE event = ?)
      AND Placing = ?
  `;
  db.run(query, [house, event, placing], function(err) {
    if (err) {
      console.error('Error deleting row:', err);
      return res.status(500).send('Database Error');
    }
    res.redirect('/admin');
  });
});

app.post('/admin/update-result', (req, res) => {
  const { original, updated } = req.body;
  
  if (!original || !updated) {
    return res.status(400).json({ error: 'Original and updated data required' });
  }

  console.log('Update request received:', { original, updated });

  const findOriginalQuery = `
    SELECT a.rowid
    FROM Arrangement a
    JOIN house h ON a.house_id = h.house_id
    JOIN events e ON a.event_id = e.event_id
    WHERE h.house = ? AND e.event = ? AND a.Placing = ?
  `;

  db.get(findOriginalQuery, [original.house, original.event, original.placing], (err, originalRecord) => {
    if (err) {
      console.error('Error finding original record:', err);
      return res.status(500).json({ error: 'Database error finding original record' });
    }

    if (!originalRecord) {
      console.log('Original record not found');
      return res.status(404).json({ error: 'Original record not found' });
    }

    console.log('Found original record with rowid:', originalRecord.rowid);

    const getHouseIdQuery = 'SELECT house_id FROM house WHERE house = ?';
    const getEventIdQuery = 'SELECT event_id FROM events WHERE event = ?';

    db.get(getHouseIdQuery, [updated.house], (err, houseRow) => {
      if (err) {
        console.error('Error finding house:', err);
        return res.status(500).json({ error: 'Database error finding house' });
      }

      if (!houseRow) {
        return res.status(400).json({ error: 'House not found: ' + updated.house });
      }

      db.get(getEventIdQuery, [updated.event], (err, eventRow) => {
        if (err) {
          console.error('Error finding event:', err);
          return res.status(500).json({ error: 'Database error finding event' });
        }

        if (!eventRow) {
          return res.status(400).json({ error: 'Event not found: ' + updated.event });
        }

        const checkDuplicateQuery = `
          SELECT a.rowid FROM Arrangement a
          JOIN house h ON a.house_id = h.house_id
          JOIN events e ON a.event_id = e.event_id
          WHERE h.house = ? AND e.event = ? AND a.Placing = ? AND a.rowid != ?
        `;

        db.get(checkDuplicateQuery, [updated.house, updated.event, updated.placing, originalRecord.rowid], (err, duplicate) => {
          if (err) {
            console.error('Error checking for duplicates:', err);
            return res.status(500).json({ error: 'Database error checking duplicates' });
          }

          if (duplicate) {
            return res.status(400).json({ error: 'A result already exists for this house/event/placing combination' });
          }

          const updateQuery = `
            UPDATE Arrangement 
            SET house_id = ?, event_id = ?, Placing = ?, Points = ?
            WHERE rowid = ?
          `;

          db.run(updateQuery, [
            houseRow.house_id, 
            eventRow.event_id, 
            updated.placing, 
            updated.points, 
            originalRecord.rowid
          ], function(err) {
            if (err) {
              console.error('Error updating record:', err);
              return res.status(500).json({ error: 'Database error updating record' });
            }

            if (this.changes === 0) {
              return res.status(404).json({ error: 'No record was updated' });
            }

            console.log(`Successfully updated record with rowid ${originalRecord.rowid}`);
            res.json({ success: true, message: 'Result updated successfully' });
          });
        });
      });
    });
  });
});

app.use((req, res) => {
  res.status(404).render("404");
});

app.listen(port, () => console.info(`App listening at http://localhost:${port}`));